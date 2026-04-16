'use client';

import { useState } from 'react';

type Props = {
  imageUrl: string;
  viewerUrl: string;
  code: string;
};

export default function PhotoActions({ imageUrl, viewerUrl, code }: Props) {
  const [copied, setCopied] = useState(false);

  const waText = `my euphoria moment ${viewerUrl}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(waText)}`;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fall back to prompt
      window.prompt('copy this link', viewerUrl);
    }
  };

  const linkClass =
    'text-white hover:text-white/70 transition-colors underline-offset-4 hover:underline';
  const dot = <span className="text-white/30 mx-3">·</span>;

  return (
    <div className="mt-8 text-white text-sm sm:text-base lowercase flex items-center flex-wrap justify-center">
      <a href={imageUrl} download={`euphoria-${code}.jpg`} className={linkClass}>
        download
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
  );
}
