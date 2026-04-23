import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { supabaseAdmin } from '@/lib/supabase';
import { generateCode } from '@/lib/code';

export const runtime = 'nodejs';

type CheckinBody = {
  name?: unknown;
  email?: unknown;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  console.log(`[checkin] running in region: ${process.env.VERCEL_REGION || 'unknown'}`);
  console.log(`[checkin] function url: ${process.env.VERCEL_URL || 'unknown'}`);

  let body: CheckinBody;
  try {
    body = await req.json();
  } catch {
    return badRequest('invalid json');
  }
  const tParsed = Date.now();
  console.log(`[checkin] body parsed in ${tParsed - t0}ms`);

  const nameRaw = typeof body.name === 'string' ? body.name.trim() : '';
  const emailRaw =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!nameRaw) return badRequest('name is required');
  if (!emailRaw) return badRequest('email is required');
  if (!emailRaw.includes('@')) return badRequest('email looks invalid');
  if (nameRaw.length > 120) return badRequest('name is too long');
  if (emailRaw.length > 200) return badRequest('email is too long');

  const tValidated = Date.now();
  console.log(`[checkin] validated in ${tValidated - tParsed}ms`);

  // Insert with retry on unique-code collision (up to 3 tries).
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode();
    const tInsertStart = Date.now();
    const { data, error } = await supabaseAdmin
      .from('guests')
      .insert({
        code,
        name: nameRaw,
        email: emailRaw,
        status: 'checked_in',
      })
      .select('code, name')
      .single();
    const tInsertEnd = Date.now();
    console.log(
      `[checkin] supabase insert took ${tInsertEnd - tInsertStart}ms (attempt ${attempt + 1})`
    );

    if (!error && data) {
      const qrDataUrl = await QRCode.toDataURL(data.code, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 512,
        color: { dark: '#000000', light: '#ffffff' },
      });
      const tQr = Date.now();
      console.log(`[checkin] qr generated in ${tQr - tInsertEnd}ms`);
      console.log(`[checkin] TOTAL ${tQr - t0}ms`);
      return NextResponse.json({ code: data.code, name: data.name, qrDataUrl });
    }

    // 23505 = Postgres unique_violation
    const isUniqueViolation =
      error?.code === '23505' || /duplicate key|unique/i.test(error?.message ?? '');

    if (!isUniqueViolation) {
      console.error('[checkin] insert failed', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
      });
      console.log(`[checkin] TOTAL ${Date.now() - t0}ms (error)`);
      return NextResponse.json(
        { error: 'could not save check-in — please try again' },
        { status: 500 }
      );
    }
    // else: loop and try a fresh code
  }

  console.log(`[checkin] TOTAL ${Date.now() - t0}ms (unique-code exhaustion)`);
  return NextResponse.json(
    { error: 'could not generate a unique code — please try again' },
    { status: 500 }
  );
}
