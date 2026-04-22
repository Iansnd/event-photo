import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { sendPhotoEmail } from '@/lib/mailer';
import { isValidCode, normalizeCode } from '@/lib/code';

export const runtime = 'nodejs';
export const maxDuration = 120;

function log(step: string, extra: Record<string, unknown> = {}) {
  console.log(`[resend] ${new Date().toISOString()} ${step}`, extra);
}

function failJson(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  const code = normalizeCode(req.nextUrl.searchParams.get('code') ?? '');
  if (!code || !isValidCode(code)) return failJson('invalid code', 400);

  log('start', { code });

  const { data: guest, error: guestErr } = await supabaseAdmin
    .from('guests')
    .select('code, name, email, composited_path')
    .eq('code', code)
    .maybeSingle();

  if (guestErr) {
    console.error('[resend] guest fetch failed', guestErr);
    return failJson('could not look up guest');
  }
  if (!guest) return failJson('guest not found', 404);
  if (!guest.composited_path) return failJson('no composited photo to resend', 404);

  const { data: pub } = supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(guest.composited_path);
  const previewUrl = `${pub.publicUrl}?t=${Date.now()}`;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const photoUrl = `${baseUrl}/p/${code}`;

  try {
    await sendPhotoEmail({
      to: guest.email,
      name: guest.name,
      photoUrl,
      previewUrl,
    });
    log('mail sent', { to: guest.email });
  } catch (err) {
    console.error('[resend] mail failed', err);
    await supabaseAdmin
      .from('guests')
      .update({ status: 'failed' })
      .eq('code', code);
    const message = err instanceof Error ? err.message : 'mail send failed';
    return failJson(`mail send failed: ${message}`);
  }

  const { error: updateErr } = await supabaseAdmin
    .from('guests')
    .update({ sent_at: new Date().toISOString(), status: 'sent' })
    .eq('code', code);
  if (updateErr) {
    console.error('[resend] db update failed', updateErr);
    return NextResponse.json({
      ok: true,
      warning: 'email sent but status update failed',
      email: guest.email,
    });
  }

  log('done', { code });
  return NextResponse.json({ ok: true, email: guest.email });
}
