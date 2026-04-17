import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { composite } from '@/lib/composite';
import { sendPhotoEmail } from '@/lib/mailer';
import { isValidCode, normalizeCode } from '@/lib/code';
import convert from 'heic-convert';

export const runtime = 'nodejs';
export const maxDuration = 60;

function log(step: string, extra: Record<string, unknown> = {}) {
  console.log(`[deliver-multi] ${new Date().toISOString()} ${step}`, extra);
}

function failJson(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function normalizeToJpeg(buffer: Buffer, label: string): Promise<Buffer> {
  const sig = buffer.subarray(4, 12).toString('ascii');
  if (/ftyp(heic|mif1|heix|hevc)/.test(sig)) {
    log(`${label} HEIC detected, converting`);
    const out = await convert({
      buffer: buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer,
      format: 'JPEG',
      quality: 0.92,
    });
    return Buffer.from(out);
  }
  return buffer;
}

function decodeBase64(b64: string): Buffer {
  const commaIx = b64.indexOf(',');
  const raw = commaIx >= 0 ? b64.slice(commaIx + 1) : b64;
  return Buffer.from(raw, 'base64');
}

export async function POST(req: NextRequest) {
  let body: {
    code?: string;
    heroBase64?: string;
    extrasBase64?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return failJson('invalid json', 400);
  }

  const code = normalizeCode(body.code ?? '');
  const heroBase64 = body.heroBase64 ?? '';
  const extrasBase64 = body.extrasBase64 ?? [];

  if (!code || !isValidCode(code)) return failJson('invalid code', 400);
  if (!heroBase64) return failJson('missing heroBase64', 400);
  if (extrasBase64.length > 4) return failJson('max 4 extras allowed', 400);

  log('start', { code, extras: extrasBase64.length });

  // 1) Fetch guest
  const { data: guest, error: guestErr } = await supabaseAdmin
    .from('guests')
    .select('id, code, name, email, status')
    .eq('code', code)
    .maybeSingle();
  if (guestErr) {
    console.error('[deliver-multi] guest fetch failed', guestErr);
    return failJson('could not look up guest');
  }
  if (!guest) return failJson('guest not found', 404);
  log('guest fetched', { code, name: guest.name });

  // 2) Decode + normalize hero
  let heroBuffer: Buffer;
  try {
    heroBuffer = decodeBase64(heroBase64);
    if (heroBuffer.length < 1000) throw new Error('hero too small');
    heroBuffer = await normalizeToJpeg(heroBuffer, 'hero');
  } catch (err) {
    console.error('[deliver-multi] hero decode failed', err);
    return failJson('Image format not supported for hero. Try JPEG or PNG.', 400);
  }
  log('hero decoded', { bytes: heroBuffer.length });

  // 3) Composite hero
  let finalBuffer: Buffer;
  try {
    finalBuffer = await composite(heroBuffer);
  } catch (err) {
    console.error('[deliver-multi] composite failed', err);
    return failJson('could not composite hero image');
  }
  log('hero composited', { bytes: finalBuffer.length });

  // 4) Upload hero
  const heroPath = `${code}/final.jpg`;
  const { error: heroUpErr } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(heroPath, finalBuffer, { contentType: 'image/jpeg', upsert: true });
  if (heroUpErr) {
    console.error('[deliver-multi] hero upload failed', heroUpErr);
    return failJson('could not upload hero photo');
  }
  const { data: heroPub } = supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(heroPath);
  const previewUrl = `${heroPub.publicUrl}?t=${Date.now()}`;
  log('hero uploaded', { path: heroPath });

  // 5) Record composited_path early so /p/[code] works even if mail fails
  {
    const { error: preErr } = await supabaseAdmin
      .from('guests')
      .update({ composited_path: heroPath, status: 'shot' })
      .eq('code', code);
    if (preErr) {
      console.error('[deliver-multi] pre-send update failed', preErr);
    }
  }

  // 6) Process and upload extras
  for (let i = 0; i < extrasBase64.length; i++) {
    const label = `extra[${i}]`;
    try {
      let buf = decodeBase64(extrasBase64[i]);
      if (buf.length < 1000) {
        log(`${label} skipped — too small`, { bytes: buf.length });
        continue;
      }
      buf = await normalizeToJpeg(buf, label);

      // Resize to max 2000px wide, preserve aspect, JPEG q88
      buf = await sharp(buf)
        .rotate()
        .resize({ width: 2000, withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      log(`${label} processed`, { bytes: buf.length });

      const extraPath = `${code}/extras/${i}.jpg`;
      const { error: upErr } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .upload(extraPath, buf, { contentType: 'image/jpeg', upsert: true });
      if (upErr) {
        console.error(`[deliver-multi] ${label} upload failed`, upErr);
        continue;
      }

      // Insert guest_extras row
      const { error: insertErr } = await supabaseAdmin
        .from('guest_extras')
        .insert({
          guest_id: guest.id,
          code,
          storage_path: extraPath,
        });
      if (insertErr) {
        console.error(`[deliver-multi] ${label} insert failed`, insertErr);
      }
      log(`${label} uploaded`, { path: extraPath });
    } catch (err) {
      console.error(`[deliver-multi] ${label} failed`, err);
      // Continue with remaining extras
    }
  }

  // 7) Update extras_count
  await supabaseAdmin
    .from('guests')
    .update({ extras_count: extrasBase64.length })
    .eq('code', code);
  log('extras_count updated', { count: extrasBase64.length });

  // 8) Render and send email
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const photoUrl = `${baseUrl}/p/${code}`;

  try {
    await sendPhotoEmail({
      to: guest.email,
      name: guest.name,
      photoUrl,
      previewUrl,
      extrasCount: extrasBase64.length,
    });
    log('mail sent', { to: guest.email });
  } catch (err) {
    console.error('[deliver-multi] mail failed', err);
    await supabaseAdmin
      .from('guests')
      .update({ status: 'failed' })
      .eq('code', code);
    const message = err instanceof Error ? err.message : 'mail send failed';
    return failJson(`mail send failed: ${message}`);
  }

  // 9) Mark sent
  const { error: finalErr } = await supabaseAdmin
    .from('guests')
    .update({ sent_at: new Date().toISOString(), status: 'sent' })
    .eq('code', code);
  if (finalErr) {
    console.error('[deliver-multi] final update failed', finalErr);
    return NextResponse.json({
      ok: true,
      warning: 'email sent but status update failed',
      email: guest.email,
    });
  }

  log('done', { code, extras: extrasBase64.length });
  return NextResponse.json({ ok: true, email: guest.email });
}
