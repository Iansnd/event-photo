import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { composite } from '@/lib/composite';
import { sendPhotoEmail } from '@/lib/mailer';
import { isValidCode, normalizeCode } from '@/lib/code';

export const runtime = 'nodejs';
export const maxDuration = 30;

function log(step: string, extra: Record<string, unknown> = {}) {
  console.log(`[deliver] ${new Date().toISOString()} ${step}`, extra);
}

function failJson(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  let body: { code?: string; portraitBase64?: string };
  try {
    body = await req.json();
  } catch {
    return failJson('invalid json', 400);
  }

  const code = normalizeCode(body.code ?? '');
  const portraitBase64 = body.portraitBase64 ?? '';

  if (!code || !isValidCode(code)) return failJson('invalid code', 400);
  if (!portraitBase64) return failJson('missing portraitBase64', 400);

  log('start', { code });

  // 1) Fetch guest
  const { data: guest, error: guestErr } = await supabaseAdmin
    .from('guests')
    .select('code, name, email, status')
    .eq('code', code)
    .maybeSingle();
  if (guestErr) {
    console.error('[deliver] guest fetch failed', guestErr);
    return failJson('could not look up guest');
  }
  if (!guest) return failJson('guest not found', 404);
  log('guest fetched', { code, name: guest.name });

  // 2) Decode portrait
  let portraitBuffer: Buffer;
  try {
    const commaIx = portraitBase64.indexOf(',');
    const raw = commaIx >= 0 ? portraitBase64.slice(commaIx + 1) : portraitBase64;
    portraitBuffer = Buffer.from(raw, 'base64');
    if (portraitBuffer.length < 1000) throw new Error('portrait too small');
  } catch (err) {
    console.error('[deliver] decode failed', err);
    return failJson('could not decode portrait');
  }
  log('decoded', { bytes: portraitBuffer.length });

  // 3) Composite
  let finalBuffer: Buffer;
  try {
    finalBuffer = await composite(portraitBuffer);
  } catch (err) {
    console.error('[deliver] composite failed', err);
    return failJson('could not composite image');
  }
  log('composited', { bytes: finalBuffer.length });

  // 4) Upload to storage
  const storagePath = `${code}/final.jpg`;
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, finalBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (uploadErr) {
    console.error('[deliver] upload failed', uploadErr);
    return failJson('could not upload photo');
  }
  const { data: pub } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  // Cache-bust so resends display the new file
  const previewUrl = `${pub.publicUrl}?t=${Date.now()}`;
  log('uploaded', { path: storagePath });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const photoUrl = `${baseUrl}/p/${code}`;

  // 5) Record composited_path before sending so /p/[code] works even if mail fails
  {
    const { error: preUpdateErr } = await supabaseAdmin
      .from('guests')
      .update({ composited_path: storagePath, status: 'shot' })
      .eq('code', code);
    if (preUpdateErr) {
      console.error('[deliver] pre-send db update failed', preUpdateErr);
      // Non-fatal — keep going
    }
  }

  // 6) Send email
  try {
    await sendPhotoEmail({
      to: guest.email,
      name: guest.name,
      photoUrl,
      previewUrl,
    });
    log('mail sent', { to: guest.email });
  } catch (err) {
    console.error('[deliver] mail failed', err);
    await supabaseAdmin
      .from('guests')
      .update({ status: 'failed' })
      .eq('code', code);
    const message = err instanceof Error ? err.message : 'mail send failed';
    return failJson(`mail send failed: ${message}`);
  }

  // 7) Mark sent
  const { error: finalUpdateErr } = await supabaseAdmin
    .from('guests')
    .update({ sent_at: new Date().toISOString(), status: 'sent' })
    .eq('code', code);
  if (finalUpdateErr) {
    console.error('[deliver] final db update failed', finalUpdateErr);
    // Mail went out; surface as ok but note.
    return NextResponse.json({
      ok: true,
      warning: 'email sent but status update failed',
      email: guest.email,
    });
  }

  log('done', { code });
  return NextResponse.json({ ok: true, email: guest.email });
}
