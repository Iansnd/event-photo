'use client';

import { useCallback, useEffect, useState } from 'react';

type Guest = {
  code: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
  sent_at: string | null;
};

type Props = {
  initialGuests: Guest[];
};

function formatTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function AdminClient({ initialGuests }: Props) {
  const [guests, setGuests] = useState<Guest[]>(initialGuests);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(new Date());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/list', { cache: 'no-store' });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.guests)) {
        setGuests(data.guests);
        setLastUpdated(new Date());
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'refresh failed');
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const counts = guests.reduce(
    (acc, g) => {
      acc.total += 1;
      if (g.status === 'checked_in') acc.checkedIn += 1;
      else if (g.status === 'shot') acc.shot += 1;
      else if (g.status === 'sent') acc.sent += 1;
      else if (g.status === 'failed') acc.failed += 1;
      return acc;
    },
    { total: 0, checkedIn: 0, shot: 0, sent: 0, failed: 0 }
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-baseline justify-between flex-wrap gap-3">
          <h1 className="text-xl font-semibold">admin · euphoria</h1>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>auto-refresh 30s</span>
            {lastUpdated && (
              <span>updated {lastUpdated.toLocaleTimeString()}</span>
            )}
            <button
              type="button"
              onClick={refresh}
              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
            >
              refresh now
            </button>
          </div>
        </header>

        <div className="flex flex-wrap gap-4 text-sm">
          <span>total: <b>{counts.total}</b></span>
          <span>checked in: <b>{counts.checkedIn}</b></span>
          <span>shot: <b>{counts.shot}</b></span>
          <span className="text-green-400">sent: <b>{counts.sent}</b></span>
          <span className="text-red-400">failed: <b>{counts.failed}</b></span>
        </div>

        {error && <p className="text-red-400 text-sm">refresh error: {error}</p>}

        <div className="overflow-x-auto rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-400 bg-zinc-900">
              <tr>
                <th className="py-2 px-3">code</th>
                <th className="py-2 px-3">name</th>
                <th className="py-2 px-3">email</th>
                <th className="py-2 px-3">status</th>
                <th className="py-2 px-3">sent at</th>
                <th className="py-2 px-3">created at</th>
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.code} className="border-t border-zinc-800">
                  <td className="py-2 px-3 font-mono">{g.code}</td>
                  <td className="py-2 px-3">{g.name}</td>
                  <td className="py-2 px-3 text-zinc-400">{g.email}</td>
                  <td className="py-2 px-3">
                    <span
                      className={
                        g.status === 'sent'
                          ? 'text-green-400'
                          : g.status === 'failed'
                            ? 'text-red-400'
                            : 'text-zinc-400'
                      }
                    >
                      {g.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-zinc-400">{formatTime(g.sent_at)}</td>
                  <td className="py-2 px-3 text-zinc-400">{formatTime(g.created_at)}</td>
                </tr>
              ))}
              {guests.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-zinc-500 text-center">
                    no guests yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
