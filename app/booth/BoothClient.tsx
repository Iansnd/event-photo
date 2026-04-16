'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

type Guest = {
  code: string;
  name: string;
  email: string;
  status: string;
};

type RecentRow = {
  code: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
  sent_at: string | null;
};

const CODE_REGEX = /\b[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}\b/;

async function fileToImageData(
  file: File,
  maxWidth: number
): Promise<{ imageData: ImageData; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxWidth / bitmap.width);
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  bitmap.close?.();
  return { imageData, width: w, height: h };
}

async function fileToJpegBase64(file: File, maxWidth: number, quality = 0.9): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxWidth / bitmap.width);
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  bitmap.close?.();
  return dataUrl;
}

export default function BoothClient() {
  // --- Section A: Current guest ---
  const [scanState, setScanState] = useState<
    | { kind: 'idle' }
    | { kind: 'scanning' }
    | { kind: 'no-qr' }
    | { kind: 'not-found'; code: string }
    | { kind: 'matched'; guest: Guest }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const [portrait, setPortrait] = useState<{
    base64: string;
    landscapeWarning: boolean;
    acknowledged: boolean;
  } | null>(null);
  const [portraitPreview, setPortraitPreview] = useState<string | null>(null);

  const [sendState, setSendState] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'sent'; email: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // --- Section B: Resend ---
  const [resendCode, setResendCode] = useState('');
  const [resendState, setResendState] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'sent'; email: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // --- Section C: Recent ---
  const [recent, setRecent] = useState<RecentRow[]>([]);

  const bindingInputRef = useRef<HTMLInputElement>(null);
  const portraitInputRef = useRef<HTMLInputElement>(null);

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch('/api/recent', { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data.guests)) setRecent(data.guests);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadRecent();
    const id = setInterval(loadRecent, 20_000);
    return () => clearInterval(id);
  }, [loadRecent]);

  const resetAll = () => {
    setScanState({ kind: 'idle' });
    setPortrait(null);
    setPortraitPreview(null);
    setSendState({ kind: 'idle' });
    if (bindingInputRef.current) bindingInputRef.current.value = '';
    if (portraitInputRef.current) portraitInputRef.current.value = '';
  };

  const onBindingChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanState({ kind: 'scanning' });
    try {
      const { imageData } = await fileToImageData(file, 1400);
      const result = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (!result) {
        setScanState({ kind: 'no-qr' });
        return;
      }
      const match = result.data.match(CODE_REGEX);
      if (!match) {
        setScanState({ kind: 'no-qr' });
        return;
      }
      const code = match[0];
      const res = await fetch(`/api/lookup?code=${encodeURIComponent(code)}`);
      if (res.status === 404) {
        setScanState({ kind: 'not-found', code });
        return;
      }
      if (!res.ok) {
        setScanState({ kind: 'error', message: `lookup failed (${res.status})` });
        return;
      }
      const guest = (await res.json()) as Guest;
      setScanState({ kind: 'matched', guest });
    } catch (err) {
      setScanState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'scan failed',
      });
    }
  };

  const onPortraitChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const landscapeWarning = bitmap.width > bitmap.height;
      bitmap.close?.();
      const base64 = await fileToJpegBase64(file, 2000, 0.9);
      setPortrait({ base64, landscapeWarning, acknowledged: !landscapeWarning });
      setPortraitPreview(base64);
    } catch (err) {
      setSendState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'could not read portrait',
      });
    }
  };

  const onSend = async () => {
    if (scanState.kind !== 'matched') return;
    if (!portrait) return;
    setSendState({ kind: 'sending' });
    try {
      const res = await fetch('/api/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: scanState.guest.code,
          portraitBase64: portrait.base64,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setSendState({
          kind: 'error',
          message: data?.error || `send failed (${res.status})`,
        });
        return;
      }
      setSendState({ kind: 'sent', email: data.email || scanState.guest.email });
      loadRecent();
    } catch (err) {
      setSendState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'send failed',
      });
    }
  };

  const onResend = async () => {
    const code = resendCode.trim().toUpperCase();
    if (code.length !== 6) {
      setResendState({ kind: 'error', message: 'need a 6-character code' });
      return;
    }
    setResendState({ kind: 'sending' });
    try {
      const res = await fetch(`/api/resend?code=${encodeURIComponent(code)}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setResendState({
          kind: 'error',
          message: data?.error || `resend failed (${res.status})`,
        });
        return;
      }
      setResendState({ kind: 'sent', email: data.email || '' });
      loadRecent();
    } catch (err) {
      setResendState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'resend failed',
      });
    }
  };

  const canSend =
    scanState.kind === 'matched' &&
    portrait !== null &&
    (!portrait.landscapeWarning || portrait.acknowledged) &&
    sendState.kind !== 'sending' &&
    sendState.kind !== 'sent';

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-8">
      <div className="mx-auto max-w-3xl space-y-12">
        <header className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">booth</h1>
          <p className="text-xs text-zinc-500">
            euphoria launch · {new Date().toLocaleDateString()}
          </p>
        </header>

        {/* Section A: Current guest */}
        <section className="space-y-6">
          <h2 className="text-sm uppercase tracking-widest text-zinc-400">current guest</h2>

          <div className="space-y-2">
            <label className="block text-sm text-zinc-300">
              1. binding shot (photo with QR visible)
            </label>
            <input
              ref={bindingInputRef}
              type="file"
              accept="image/*"
              onChange={onBindingChange}
              className="block w-full text-sm text-zinc-300 file:mr-3 file:py-2 file:px-4 file:border-0 file:bg-zinc-800 file:text-zinc-100 file:text-sm hover:file:bg-zinc-700"
            />
            <div className="min-h-[44px] text-sm">
              {scanState.kind === 'scanning' && (
                <p className="text-zinc-400">scanning…</p>
              )}
              {scanState.kind === 'matched' && (
                <div className="rounded-md bg-green-900/30 border border-green-700 px-3 py-2">
                  <p className="text-green-300 text-lg font-semibold">
                    MATCHED: {scanState.guest.name}
                  </p>
                  <p className="text-green-200 text-sm">
                    {scanState.guest.email} · code {scanState.guest.code} · status{' '}
                    {scanState.guest.status}
                  </p>
                </div>
              )}
              {scanState.kind === 'not-found' && (
                <p className="text-red-400">
                  Code {scanState.code} not in database.
                </p>
              )}
              {scanState.kind === 'no-qr' && (
                <p className="text-red-400">No QR code detected — retake binding shot.</p>
              )}
              {scanState.kind === 'error' && (
                <p className="text-red-400">Error: {scanState.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-zinc-300">2. portrait to send</label>
            <input
              ref={portraitInputRef}
              type="file"
              accept="image/*"
              onChange={onPortraitChange}
              className="block w-full text-sm text-zinc-300 file:mr-3 file:py-2 file:px-4 file:border-0 file:bg-zinc-800 file:text-zinc-100 file:text-sm hover:file:bg-zinc-700"
            />
            {portrait && portrait.landscapeWarning && !portrait.acknowledged && (
              <div className="rounded-md bg-yellow-900/30 border border-yellow-700 px-3 py-2">
                <p className="text-yellow-300 text-sm">
                  This is landscape — will be heavily cropped. Use a vertical portrait?
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setPortrait((p) => (p ? { ...p, acknowledged: true } : p))
                  }
                  className="mt-2 px-3 py-1 text-xs bg-yellow-700 hover:bg-yellow-600 text-yellow-50"
                >
                  upload anyway
                </button>
              </div>
            )}
            {portraitPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={portraitPreview}
                alt="portrait preview"
                className="mt-2 max-h-64 rounded border border-zinc-800"
              />
            )}
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="button"
              disabled={!canSend}
              onClick={onSend}
              className="px-6 py-3 bg-[var(--color-euphoria-violet)] hover:bg-violet-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium transition-colors"
            >
              {sendState.kind === 'sending' ? 'sending…' : 'send to guest'}
            </button>

            {sendState.kind === 'sent' && (
              <>
                <p className="text-green-400 text-sm font-semibold">
                  SENT to {sendState.email}
                </p>
                <button
                  type="button"
                  onClick={resetAll}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm"
                >
                  next guest
                </button>
              </>
            )}
            {sendState.kind === 'error' && (
              <p className="text-red-400 text-sm">{sendState.message}</p>
            )}
          </div>
        </section>

        <hr className="border-zinc-800" />

        {/* Section B: Resend */}
        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-widest text-zinc-400">resend</h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={resendCode}
              onChange={(e) => setResendCode(e.target.value.toUpperCase())}
              placeholder="6-char code"
              maxLength={6}
              className="px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono uppercase tracking-widest focus:outline-none focus:border-zinc-600"
            />
            <button
              type="button"
              onClick={onResend}
              disabled={resendState.kind === 'sending'}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 text-zinc-100 text-sm"
            >
              {resendState.kind === 'sending' ? 'sending…' : 'resend'}
            </button>
            {resendState.kind === 'sent' && (
              <p className="text-green-400 text-sm">resent to {resendState.email}</p>
            )}
            {resendState.kind === 'error' && (
              <p className="text-red-400 text-sm">{resendState.message}</p>
            )}
          </div>
        </section>

        <hr className="border-zinc-800" />

        {/* Section C: Recent */}
        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-widest text-zinc-400">recent sends</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500 border-b border-zinc-800">
                <tr>
                  <th className="py-2 pr-4">time</th>
                  <th className="py-2 pr-4">code</th>
                  <th className="py-2 pr-4">name</th>
                  <th className="py-2 pr-4">email</th>
                  <th className="py-2 pr-4">status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.code} className="border-b border-zinc-900">
                    <td className="py-2 pr-4 text-zinc-400">
                      {new Date(r.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-2 pr-4 font-mono">{r.code}</td>
                    <td className="py-2 pr-4">{r.name}</td>
                    <td className="py-2 pr-4 text-zinc-400">{r.email}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          r.status === 'sent'
                            ? 'text-green-400'
                            : r.status === 'failed'
                              ? 'text-red-400'
                              : 'text-zinc-500'
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-zinc-500 text-center">
                      no recent sends
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
