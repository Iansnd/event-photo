import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('guests')
    .select('code, name, email, status, created_at, sent_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin/list] query failed', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }
  return NextResponse.json({ guests: data ?? [] });
}
