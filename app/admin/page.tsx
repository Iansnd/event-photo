import AdminClient from './AdminClient';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'admin · euphoria',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const { data, error } = await supabaseAdmin
    .from('guests')
    .select('code, name, email, status, created_at, sent_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin] query failed', error);
  }

  return <AdminClient initialGuests={data ?? []} />;
}
