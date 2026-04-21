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
};

export default function Carousel({ photos, code }: Props) {
  const [idx, setIdx] = useState(0);
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

  const savePhoto = async (photo: Photo) => {
    try {
      const res = await fetch(photo.url);
      const blob = await res.blob();
      const file = new File([blob], photo.filename, { type: 'image/jpeg' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Your Euphoria moment' });
        return;
      }

      // Fallback: direct download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = photo.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('save failed', err);
    }
  };

  const shareToInstagram = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
    if (isMobile) {
      const start = Date.now();
      window.location.href = 'instagram-stories://share';
      setTimeout(() => {
        if (Date.now() - start < 1600 && document.visibilityState === 'visible') {
          window.location.href = 'https://www.instagram.com/';
        }
      }, 1500);
    } else {
      window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    }
  };

  const current = photos[idx];

  const btnClass =
    'border border-white text-white uppercase bg-transparent px-8 py-3.5 text-sm transition-colors hover:bg-white hover:text-black rounded-none';

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
      <div
        className="py-4 flex flex-col sm:flex-row items-center gap-3 w-full px-6 sm:w-auto sm:px-0"
        style={{ letterSpacing: '0.2em' }}
      >
        <button
          type="button"
          onClick={() => savePhoto(current)}
          className={`${btnClass} w-full sm:w-auto`}
        >
          save photo
        </button>
        <button
          type="button"
          onClick={shareToInstagram}
          className={`${btnClass} w-full sm:w-auto`}
        >
          share to instagram
        </button>
      </div>

      {/* Footer */}
      <p className="pb-6 text-white/40 text-[11px] tracking-[0.15em]">
        Calvin Klein euphoria elixirs
      </p>
    </div>
  );
}
