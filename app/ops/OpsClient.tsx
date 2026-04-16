'use client';

import { useState } from 'react';

type ActionState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string };

export default function OpsClient() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [resendState, setResendState] = useState<ActionState>({ kind: 'idle' });

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/ops-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setAuthError(data?.error || 'wrong password');
      } else {
        setAuthed(true);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'login failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const onResendLastFailed = async () => {
    setResendState({ kind: 'busy' });
    try {
      const res = await fetch('/api/ops/resend-last-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setResendState({
          kind: 'error',
          message: data?.error || `resend failed (${res.status})`,
        });
        return;
      }
      setResendState({
        kind: 'ok',
        message: `resent ${data.code} to ${data.email}`,
      });
    } catch (err) {
      setResendState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'resend failed',
      });
    }
  };

  const exportUrl = `/api/ops/export-csv?password=${encodeURIComponent(password)}`;

  if (!authed) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-6">
        <form onSubmit={onLogin} className="w-full max-w-sm space-y-4">
          <h1 className="text-xl font-semibold">ops</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            className="block w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-zinc-600"
          />
          <button
            type="submit"
            disabled={authBusy || password.length === 0}
            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 text-zinc-100 text-sm"
          >
            {authBusy ? 'checking…' : 'unlock'}
          </button>
          {authError && <p className="text-red-400 text-sm">{authError}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-8">
      <div className="mx-auto max-w-xl space-y-8">
        <header className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">ops</h1>
          <button
            type="button"
            onClick={() => {
              setAuthed(false);
              setPassword('');
              setResendState({ kind: 'idle' });
            }}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            lock
          </button>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-widest text-zinc-400">emergency</h2>

          <div className="space-y-2">
            <button
              type="button"
              onClick={onResendLastFailed}
              disabled={resendState.kind === 'busy'}
              className="w-full py-3 bg-[var(--color-euphoria-violet)] hover:bg-violet-700 disabled:bg-zinc-700 text-white text-sm font-medium"
            >
              {resendState.kind === 'busy' ? 'resending…' : 'resend last failed'}
            </button>
            {resendState.kind === 'ok' && (
              <p className="text-green-400 text-sm">{resendState.message}</p>
            )}
            {resendState.kind === 'error' && (
              <p className="text-red-400 text-sm">{resendState.message}</p>
            )}
          </div>

          <div>
            <a
              href={exportUrl}
              className="block w-full py-3 text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-medium"
            >
              export csv
            </a>
            <p className="text-xs text-zinc-500 mt-1">
              downloads a csv of all guest rows
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
