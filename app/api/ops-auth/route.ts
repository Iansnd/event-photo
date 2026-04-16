import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

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
  if (body.password === expected) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: 'wrong password' }, { status: 401 });
}
