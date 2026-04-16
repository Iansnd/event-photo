import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { sendPhotoEmail } from '@/lib/mailer';

export const runtime = 'nodejs';
export const maxDuration = 30;

function log(step: string, extra: Record<string, unknown> = {}) {
  console.log(`[ops/resend-last-failed] ${new Date().toISOString()} ${step}`, extra);
}

export async function POST(req: NextRequest) {
  const expected = process.env.OPS_PASSWORD;
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'ops password not configured' }, { status: 500 });
  }
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  if (body.password !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  log('start');

  const { data: failed, error: fetchErr } = await supabaseAdmin
    .from('guests')
    .select('code, name, email, composited_path')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) {
    console.error('[ops/resend-last-failed] fetch err', fetchErr);
    return NextResponse.json({ ok: false, error: 'could not query failed guests' }, { status: 500 });
  }
  if (!failed) {
    return NextResponse.json({ ok: false, error: 'no failed guests to resend' }, { status: 404 });
  }
  if (!failed.composited_path) {
    return NextResponse.json(
      { ok: false, error: `guest ${failed.code} has no composited photo` },
      { status: 404 }
    );
  }

  const { data: pub } = supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(failed.composited_path);
  const previewUrl = `${pub.publicUrl}?t=${Date.now()}`;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const photoUrl = `${baseUrl}/p/${failed.code}`;

  try {
    await sendPhotoEmail({
      to: failed.email,
      name: failed.name,
      photoUrl,
      previewUrl,
    });
  } catch (err) {
    console.error('[ops/resend-last-failed] mail err', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'mail send failed',
        code: failed.code,
      },
      { status: 500 }
    );
  }

  await supabaseAdmin
    .from('guests')
    .update({ sent_at: new Date().toISOString(), status: 'sent' })
    .eq('code', failed.code);

  log('done', { code: failed.code });
  return NextResponse.json({ ok: true, code: failed.code, email: failed.email });
}
