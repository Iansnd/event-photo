import { notFound } from 'next/navigation';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { isValidCode, normalizeCode } from '@/lib/code';
import Carousel, { type Photo } from './Carousel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return {
    title: `your euphoria photo · ${code.toUpperCase()}`,
    robots: { index: false, follow: false },
  };
}

export default async function PhotoPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);

  if (!isValidCode(code)) notFound();

  const { data: guest, error } = await supabaseAdmin
    .from('guests')
    .select('code, name, composited_path, sent_at, created_at')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    console.error('[/p/[code]] lookup failed', error);
  }

  // Fetch extras (table may not exist yet — handle gracefully)
  let extras: { storage_path: string; created_at: string }[] = [];
  try {
    const { data, error: extrasErr } = await supabaseAdmin
      .from('guest_extras')
      .select('storage_path, created_at')
      .eq('code', code)
      .order('created_at', { ascending: true });
    if (!extrasErr && data) {
      extras = data;
    }
  } catch {
    // guest_extras table may not exist — that's fine
  }

  // Build photo array
  const photos: Photo[] = [];

  if (guest?.composited_path) {
    const { data: pub } = supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(guest.composited_path);
    photos.push({
      url: pub.publicUrl,
      isHero: true,
      createdAt: guest.sent_at ?? guest.created_at,
      filename: `euphoria-${code}-hero.jpg`,
    });
  }

  for (let i = 0; i < extras.length; i++) {
    const e = extras[i];
    const { data: pub } = supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(e.storage_path);
    photos.push({
      url: pub.publicUrl,
      isHero: false,
      createdAt: e.created_at,
      filename: `euphoria-${code}-${i + 1}.jpg`,
    });
  }

  // Sort chronologically
  photos.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  if (photos.length === 0) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <p className="text-white/80 text-base lowercase text-center max-w-md">
          your photo isn&apos;t ready yet — check back in a minute
        </p>
      </main>
    );
  }

  return <Carousel photos={photos} code={code} />;
}
