import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const expected = process.env.OPS_PASSWORD;
  const password = req.nextUrl.searchParams.get('password') ?? '';
  if (!expected || password !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('guests')
    .select('code, name, email, status, created_at, sent_at, portrait_path, composited_path')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[ops/export-csv] query failed', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  const rows = data ?? [];
  const headers = [
    'code',
    'name',
    'email',
    'status',
    'created_at',
    'sent_at',
    'portrait_path',
    'composited_path',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => escapeCell((r as Record<string, unknown>)[h])).join(','));
  }
  const csv = lines.join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="guests-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
