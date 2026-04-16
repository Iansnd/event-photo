import { NextRequest, NextResponse } from 'next/server';
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
  let body: CheckinBody;
  try {
    body = await req.json();
  } catch {
    return badRequest('invalid json');
  }

  const nameRaw = typeof body.name === 'string' ? body.name.trim() : '';
  const emailRaw =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!nameRaw) return badRequest('name is required');
  if (!emailRaw) return badRequest('email is required');
  if (!emailRaw.includes('@')) return badRequest('email looks invalid');
  if (nameRaw.length > 120) return badRequest('name is too long');
  if (emailRaw.length > 200) return badRequest('email is too long');

  // Insert with retry on unique-code collision (up to 3 tries).
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode();
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

    if (!error && data) {
      return NextResponse.json({ code: data.code, name: data.name });
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
      return NextResponse.json(
        { error: 'could not save check-in — please try again' },
        { status: 500 }
      );
    }
    // else: loop and try a fresh code
  }

  return NextResponse.json(
    { error: 'could not generate a unique code — please try again' },
    { status: 500 }
  );
}
