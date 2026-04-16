import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidCode, normalizeCode } from '@/lib/code';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('code') ?? '';
  const code = normalizeCode(raw);
  if (!code || !isValidCode(code)) {
    return NextResponse.json({ error: 'invalid code' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('guests')
    .select('code, name, email, status')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    console.error('[lookup] query failed', error);
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}
