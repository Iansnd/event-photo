'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type Photo = {
  url: string;
  isHero: boolean;
  createdAt: string;
  filename: string;
};

type Props = {
  photos: Photo[];
  code: string;
  viewUrl: string;
};

export default function Carousel({ photos, code, viewUrl }: Props) {
  const [idx, setIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [fade, setFade] = useState(false);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const total = photos.length;

  const go = useCallback(
    (dir: 1 | -1) => {
      if (total <= 1) return;
      setFade(true);
      setTimeout(() => {
        setIdx((prev) => (prev + dir + total) % total);
        setFade(false);
      }, 150);
    },
    [total],
  );

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // Preload adjacent images
  useEffect(() => {
    if (total <= 1) return;
    const next = (idx + 1) % total;
    const prev = (idx - 1 + total) % total;
    [next, prev].forEach((i) => {
      const img = new Image();
      img.src = photos[i].url;
    });
  }, [idx, photos, total]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    touchRef.current = null;
    // Only swipe if horizontal movement exceeds threshold and is more horizontal than vertical
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      go(dx < 0 ? 1 : -1);
    }
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(viewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('copy this link', viewUrl);
    }
  };

  const current = photos[idx];
  const downloadUrl = `${current.url}?download=${encodeURIComponent(current.filename)}`;
  const waText = `my euphoria moment ${viewUrl}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(waText)}`;
  const linkClass =
    'text-white hover:text-white/70 transition-colors underline-offset-4 hover:underline';
  const dot = <span className="text-white/30 mx-2 sm:mx-3">·</span>;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center">
      {/* Counter */}
      {total > 1 && (
        <p className="pt-4 pb-2 text-white/60 text-sm lowercase">
          photo {idx + 1} of {total}
        </p>
      )}
      {total <= 1 && <div className="pt-4 pb-2" />}

      {/* Image area with tap zones */}
      <div
        className="flex-1 w-full flex items-center justify-center relative select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Left tap zone (mobile) */}
        {total > 1 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-0 top-0 w-1/3 h-full z-10 sm:hidden"
            aria-label="previous photo"
          />
        )}

        {/* Right tap zone (mobile) */}
        {total > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-0 top-0 w-1/3 h-full z-10 sm:hidden"
            aria-label="next photo"
          />
        )}

        {/* Left arrow (desktop) */}
        {total > 1 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white/40 hover:text-white transition-colors p-2"
            aria-label="previous photo"
          >
            <svg width="24" height="48" viewBox="0 0 24 48" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="18,4 6,24 18,44" />
            </svg>
          </button>
        )}

        {/* Right arrow (desktop) */}
        {total > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white/40 hover:text-white transition-colors p-2"
            aria-label="next photo"
          >
            <svg width="24" height="48" viewBox="0 0 24 48" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="6,4 18,24 6,44" />
            </svg>
          </button>
        )}

        {/* Photo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.isHero ? 'your euphoria photo' : `photo ${idx + 1}`}
          className={`block max-h-[85vh] max-w-[95vw] object-contain transition-opacity duration-150 ${fade ? 'opacity-0' : 'opacity-100'}`}
        />
      </div>

      {/* Dots */}
      {total > 1 && (
        <div className="flex items-center gap-2 py-4">
          {photos.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (i !== idx) {
                  setFade(true);
                  setTimeout(() => {
                    setIdx(i);
                    setFade(false);
                  }, 150);
                }
              }}
              aria-label={`go to photo ${i + 1}`}
              className="transition-all"
              style={{
                width: i === idx ? 8 : 6,
                height: i === idx ? 8 : 6,
                borderRadius: '50%',
                backgroundColor: i === idx
                  ? (p.isHero ? '#6B2BD9' : '#ffffff')
                  : 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="py-4 text-white text-sm sm:text-base lowercase flex items-center flex-wrap justify-center gap-y-2">
        <a href={downloadUrl} download={current.filename} className={linkClass}>
          download this photo
        </a>
        {dot}
        <a href={`/api/download-zip?code=${code}`} className={linkClass}>
          download all
        </a>
        {dot}
        <a href={waHref} target="_blank" rel="noopener noreferrer" className={linkClass}>
          share to whatsapp
        </a>
        {dot}
        <button type="button" onClick={onCopy} className={linkClass}>
          {copied ? 'copied' : 'copy link'}
        </button>
      </div>

      {/* Footer */}
      <p className="pb-6 text-white/40 text-[11px] lowercase tracking-[0.15em]">
        calvin klein × euphoria launch
      </p>
    </div>
  );
}
