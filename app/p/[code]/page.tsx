import { notFound } from 'next/navigation';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { isValidCode, normalizeCode } from '@/lib/code';
import PhotoActions from './PhotoActions';

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
    .select('code, name, composited_path')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    console.error('[/p/[code]] lookup failed', error);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const viewerUrl = `${baseUrl}/p/${code}`;

  if (!guest || !guest.composited_path) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <p className="text-white/80 text-base lowercase text-center max-w-md">
          your photo isn&apos;t ready yet — check back in a minute
        </p>
      </main>
    );
  }

  const { data: pub } = supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(guest.composited_path);
  const imageUrl = pub.publicUrl;

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 py-6">
      <div className="w-full flex-1 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="your euphoria photo"
          className="block max-h-[92vh] max-w-[92vw] object-contain"
        />
      </div>

      <PhotoActions imageUrl={imageUrl} viewerUrl={viewerUrl} code={code} />

      <p className="mt-8 text-white/40 text-[11px] lowercase tracking-[0.15em]">
        calvin klein × euphoria
      </p>
    </main>
  );
}
