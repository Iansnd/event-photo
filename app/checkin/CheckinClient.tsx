'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

type Step = 'form' | 'qr';

type CheckinClientProps = {
  eventName: string;
};

const INACTIVITY_MS = 60_000;

export default function CheckinClient({ eventName }: CheckinClientProps) {
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string; name: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setStep('form');
    setName('');
    setEmail('');
    setError(null);
    setResult(null);
    setQrDataUrl(null);
    setSubmitting(false);
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }, []);

  const scheduleInactivityReset = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => reset(), INACTIVITY_MS);
  }, [reset]);

  useEffect(() => {
    if (step !== 'qr') return;
    scheduleInactivityReset();
    const onInteract = () => scheduleInactivityReset();
    window.addEventListener('touchstart', onInteract, { passive: true });
    window.addEventListener('mousedown', onInteract);
    window.addEventListener('keydown', onInteract);
    return () => {
      window.removeEventListener('touchstart', onInteract);
      window.removeEventListener('mousedown', onInteract);
      window.removeEventListener('keydown', onInteract);
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }
    };
  }, [step, scheduleInactivityReset]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName || !trimmedEmail || !trimmedEmail.includes('@')) {
      setError('please enter a name and a valid email');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, email: trimmedEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'something went wrong');
      }
      const dataUrl = await QRCode.toDataURL(data.code, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 512,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setResult({ code: data.code, name: data.name });
      setQrDataUrl(dataUrl);
      setStep('qr');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = name.trim().length > 0 && email.trim().includes('@') && !submitting;

  if (step === 'qr' && result && qrDataUrl) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-[520px] flex flex-col items-center">
          <p className="text-white text-xl sm:text-2xl lowercase tracking-tight text-center">
            hi {result.name.split(' ')[0].toLowerCase()},
          </p>
          <p className="mt-3 text-white/60 text-sm sm:text-base lowercase text-center">
            hand this to the photographer
          </p>

          <div
            className="mt-10 bg-white p-8"
            style={{ boxShadow: '0 20px 60px rgba(107,43,217,0.3)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="check-in QR code"
              width={420}
              height={420}
              className="block w-[420px] h-[420px] max-w-[72vw] max-h-[72vw]"
            />
          </div>

          <p
            className="mt-10 text-white/60 font-mono text-2xl"
            style={{ letterSpacing: '0.2em' }}
          >
            {result.code}
          </p>

          <button
            type="button"
            onClick={reset}
            className="mt-16 text-white/40 hover:text-white/70 hover:underline text-sm lowercase underline-offset-4 transition-colors"
          >
            start over
          </button>
        </div>
        <p className="absolute bottom-6 text-white/30 text-xs lowercase tracking-[0.15em]">
          {eventName.toLowerCase()}
        </p>
      </main>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{
        backgroundImage: "url('/brand/checkin-bg-form.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Legibility overlay */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      {/* Form content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <main className="relative min-h-screen text-white flex flex-col items-center justify-center px-6 py-10">
          <form onSubmit={onSubmit} className="w-full max-w-[480px]">
            <p
              className="text-white text-xs lowercase"
              style={{ letterSpacing: '0.15em' }}
            >
              euphoria
            </p>
            <h1 className="mt-10 text-white text-3xl sm:text-4xl lowercase tracking-tight font-normal leading-tight">
              tell us who you are
            </h1>

            <div className="mt-14 space-y-10">
              <input
                type="text"
                autoComplete="name"
                placeholder="your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block w-full bg-transparent border-0 border-b border-white/80 focus:border-[var(--color-euphoria-violet)] focus:outline-none text-white placeholder-white/40 text-lg sm:text-xl py-4 rounded-none"
                style={{ letterSpacing: '0.01em' }}
              />
              <input
                type="email"
                inputMode="email"
                autoCapitalize="off"
                autoComplete="email"
                placeholder="your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full bg-transparent border-0 border-b border-white/80 focus:border-[var(--color-euphoria-violet)] focus:outline-none text-white placeholder-white/40 text-lg sm:text-xl py-4 rounded-none"
                style={{ letterSpacing: '0.01em' }}
              />
            </div>

            {error && (
              <p className="mt-6 text-sm lowercase" style={{ color: '#ff5d5d' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-14 w-full py-4 text-base sm:text-lg lowercase bg-white text-black disabled:bg-white/30 disabled:text-black/60 transition-colors"
              style={{ borderRadius: 0 }}
            >
              {submitting ? 'checking in…' : 'continue'}
            </button>
          </form>

          <p
            className="absolute bottom-6 text-white/30 text-xs lowercase"
            style={{ letterSpacing: '0.15em' }}
          >
            {eventName.toLowerCase()}
          </p>
        </main>
      </div>
    </div>
  );
}
