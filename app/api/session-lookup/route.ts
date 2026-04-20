import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidCode, normalizeCode } from '@/lib/code';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = normalizeCode(req.nextUrl.searchParams.get('code') ?? '');
  if (!code || !isValidCode(code)) {
    return NextResponse.json({ error: 'invalid code' }, { status: 400 });
  }

  const { data: guest, error } = await supabaseAdmin
    .from('guests')
    .select('name, email, status, extras_count')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    console.error('[session-lookup] db error', error);
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
  }
  if (!guest) {
    return NextResponse.json({ error: 'guest not found' }, { status: 404 });
  }

  return NextResponse.json({
    name: guest.name,
    email: guest.email,
    status: guest.status,
    extras_count: guest.extras_count ?? 0,
  });
}
