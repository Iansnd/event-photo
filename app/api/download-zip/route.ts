import archiver from 'archiver';
import { NextRequest } from 'next/server';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { isValidCode, normalizeCode } from '@/lib/code';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('code') ?? '';
  const code = normalizeCode(raw);
  if (!code || !isValidCode(code)) {
    return new Response('Missing or invalid code', { status: 400 });
  }

  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('code, composited_path')
    .eq('code', code)
    .maybeSingle();

  if (!guest || !guest.composited_path) {
    return new Response('Not found', { status: 404 });
  }

  // Fetch extras (table may not exist yet)
  let extras: { storage_path: string; created_at: string }[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('guest_extras')
      .select('storage_path, created_at')
      .eq('code', code)
      .order('created_at', { ascending: true });
    if (!error && data) {
      extras = data;
    }
  } catch {
    // guest_extras table may not exist
  }

  const archive = archiver('zip', { zlib: { level: 6 } });

  const stream = new ReadableStream({
    async start(controller) {
      archive.on('data', (chunk: Buffer) => controller.enqueue(chunk));
      archive.on('end', () => controller.close());
      archive.on('error', (err: Error) => controller.error(err));

      // Add hero
      const { data: heroPub } = supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(guest.composited_path!);
      const heroRes = await fetch(heroPub.publicUrl);
      const heroBuf = Buffer.from(await heroRes.arrayBuffer());
      archive.append(heroBuf, { name: `euphoria-${code}-hero.jpg` });

      // Add extras
      for (let i = 0; i < extras.length; i++) {
        const { data: pub } = supabaseAdmin.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(extras[i].storage_path);
        const res = await fetch(pub.publicUrl);
        const buf = Buffer.from(await res.arrayBuffer());
        archive.append(buf, { name: `euphoria-${code}-${i + 1}.jpg` });
      }

      archive.finalize();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="euphoria-${code}.zip"`,
    },
  });
}
