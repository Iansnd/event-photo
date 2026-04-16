import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { transporter } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  let dbStatus: string = 'ok';
  let smtpStatus: string = 'ok';

  // DB check: a trivial select to confirm the service role key + host reach.
  try {
    const { error } = await supabaseAdmin.from('guests').select('code').limit(1);
    if (error) dbStatus = `error: ${error.message}`;
  } catch (err) {
    dbStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  // SMTP check
  try {
    await transporter.verify();
  } catch (err) {
    smtpStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  const ok = dbStatus === 'ok' && smtpStatus === 'ok';
  return NextResponse.json(
    { ok, db: dbStatus, smtp: smtpStatus },
    { status: ok ? 200 : 503 }
  );
}
