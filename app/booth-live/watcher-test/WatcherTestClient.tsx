'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { pickFolder, scanFolder, type NewFile } from '@/lib/watcher/watcher';
import { detectQrInJpeg } from '@/lib/watcher/qr';
import { generateThumbnail } from '@/lib/watcher/thumbnail';

type DetectedFile = {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  qrCode: string | null;
  qrChecked: boolean;
  sizeBytes: number;
  fileType: 'jpeg' | 'png' | 'heic' | 'unknown';
  skipReason?: string;
};

export default function WatcherTestClient() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState('');
  const [files, setFiles] = useState<DetectedFile[]>([]);
  const [pollCount, setPollCount] = useState(0);
  const seenRef = useRef(new Set<string>());
  const pendingRef = useRef(new Map<string, { size: number; mtime: number; firstSeenAt: number; handle: FileSystemFileHandle }>());
  const pollingRef = useRef(false);

  useEffect(() => {
    setSupported(typeof window.showDirectoryPicker === 'function');
  }, []);

  const processNewFile = useCallback(async (nf: NewFile) => {
    seenRef.current.add(nf.id);

    // Add placeholder entry immediately
    const entry: DetectedFile = {
      id: nf.id,
      name: nf.name,
      thumbnailDataUrl: '',
      qrCode: null,
      qrChecked: false,
      sizeBytes: nf.file.size,
      fileType: nf.fileType,
      skipReason: nf.skipReason,
    };
    setFiles((prev) => [entry, ...prev]);

    // If the file is skipped, mark QR as checked (N/A) and stop
    if (nf.skipReason) {
      setFiles((prev) =>
        prev.map((f) => (f.id === nf.id ? { ...f, qrChecked: true } : f)),
      );
      return;
    }

    // Generate thumbnail
    try {
      const thumb = await generateThumbnail(nf.file);
      setFiles((prev) =>
        prev.map((f) => (f.id === nf.id ? { ...f, thumbnailDataUrl: thumb } : f)),
      );
    } catch {
      // thumbnail failed — placeholder stays
    }

    // Detect QR
    try {
      const qr = await detectQrInJpeg(nf.file);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === nf.id ? { ...f, qrCode: qr, qrChecked: true } : f,
        ),
      );
    } catch {
      setFiles((prev) =>
        prev.map((f) => (f.id === nf.id ? { ...f, qrChecked: true } : f)),
      );
    }
  }, []);

  const poll = useCallback(async () => {
    if (!handle || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const newFiles = await scanFolder(handle, seenRef.current, pendingRef.current);
      if (newFiles === null) {
        // Permission lost
        setHandle(null);
        setFolderName('');
        return;
      }
      setPollCount((c) => c + 1);
      for (const nf of newFiles) {
        processNewFile(nf);
      }
    } finally {
      pollingRef.current = false;
    }
  }, [handle, processNewFile]);

  // Poll every 2 seconds when we have a handle
  useEffect(() => {
    if (!handle) return;
    poll(); // immediate first poll
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [handle, poll]);

  const onPickFolder = async () => {
    const h = await pickFolder();
    if (h) {
      setHandle(h);
      setFolderName(h.name);
      seenRef.current.clear();
      setFiles([]);
      setPollCount(0);
    }
  };

  const skippedCount = files.filter((f) => f.skipReason).length;

  if (supported === null) return null;

  if (!supported) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold text-red-400">
            Browser not supported
          </h1>
          <p className="text-zinc-400">
            This page requires <strong>Google Chrome</strong> or a Chromium-based
            browser with File System Access API support.
          </p>
          <a href="/booth" className="inline-block text-sm text-violet-400 underline">
            use /booth (manual upload) instead
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-baseline justify-between flex-wrap gap-3">
          <h1 className="text-xl font-semibold">watcher test</h1>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            {handle ? (
              <>
                <span className="text-green-400">watching: {folderName}</span>
                <span>polls: {pollCount}</span>
                <span>files: {files.length}</span>
                {skippedCount > 0 && (
                  <span className="text-yellow-400">skipped: {skippedCount}</span>
                )}
              </>
            ) : (
              <span>no folder selected</span>
            )}
          </div>
        </header>

        {!handle && (
          <button
            type="button"
            onClick={onPickFolder}
            className="px-6 py-3 bg-violet-700 hover:bg-violet-600 text-white text-sm font-medium"
          >
            pick folder to watch
          </button>
        )}

        {handle && (
          <button
            type="button"
            onClick={onPickFolder}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs"
          >
            change folder
          </button>
        )}

        {files.length === 0 && handle && (
          <p className="text-zinc-500 text-sm">
            waiting for new images in {folderName}...
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {files.map((f) => {
            // --- 0-byte / iCloud stub ---
            if (f.sizeBytes === 0) {
              return (
                <div key={f.id} className="bg-zinc-900 border border-zinc-700 p-2 space-y-2">
                  <div className="w-full aspect-[3/4] bg-zinc-800 flex items-center justify-center">
                    <span className="text-zinc-600 text-2xl">☁</span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate" title={f.name}>
                    {f.name}
                  </p>
                  <p className="text-xs text-zinc-500 leading-snug">
                    0 bytes — iCloud file not yet downloaded locally.
                    Right-click in Finder → Download Now, then it&apos;ll be
                    picked up on next scan.
                  </p>
                </div>
              );
            }

            // --- HEIC / HEIF ---
            if (f.fileType === 'heic') {
              return (
                <div key={f.id} className="bg-zinc-900 border border-yellow-700/60 p-2 space-y-2">
                  <div className="w-full aspect-[3/4] bg-yellow-950/30 flex items-center justify-center">
                    <span className="text-yellow-500 text-2xl">⚠</span>
                  </div>
                  <p className="text-xs text-yellow-400 leading-snug">
                    HEIC not supported in browser — please configure EOS
                    Utility to save JPEG format instead. See camera settings.
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {f.name} ({(f.sizeBytes / 1024 / 1024).toFixed(1)} MB)
                  </p>
                </div>
              );
            }

            // --- Normal: JPEG / PNG / unknown (process normally) ---
            return (
              <div key={f.id} className="bg-zinc-900 border border-zinc-800 p-2 space-y-2">
                {f.thumbnailDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.thumbnailDataUrl}
                    alt={f.name}
                    className="w-full aspect-[3/4] object-cover bg-zinc-800"
                  />
                ) : (
                  <div className="w-full aspect-[3/4] bg-zinc-800 animate-pulse" />
                )}
                <p className="text-xs text-zinc-400 truncate" title={f.name}>
                  {f.name}
                </p>
                <p className="text-xs">
                  {!f.qrChecked ? (
                    <span className="text-zinc-500">scanning QR...</span>
                  ) : f.qrCode ? (
                    <span className="text-green-400 font-mono font-semibold">
                      QR: {f.qrCode}
                    </span>
                  ) : (
                    <span className="text-zinc-500">no QR</span>
                  )}
                </p>
                <p className="text-[10px] text-zinc-600">
                  {(f.sizeBytes / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
