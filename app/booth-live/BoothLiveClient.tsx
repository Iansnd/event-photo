'use client';

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { pickFolder, scanFolder, type NewFile } from '@/lib/watcher/watcher';
import { detectQrInJpeg } from '@/lib/watcher/qr';
import { generateThumbnail } from '@/lib/watcher/thumbnail';
import { reduce } from '@/lib/watcher/session';
import { emptyState, type WatcherState, type SessionEvent } from '@/lib/watcher/types';

// ── Helpers ──────────────────────────────────────────────────

type Toast = { id: number; message: string; color: 'green' | 'red' | 'yellow' };
let toastId = 0;

function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s ago`;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

// ── Component ────────────────────────────────────────────────

type Tab = 'current' | 'unclaimed' | 'recent';

export default function BoothLiveClient() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [state, dispatch] = useReducer(reduce, emptyState());
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>('current');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sendMode, setSendMode] = useState<'hero' | 'extras'>('hero');
  const [isSending, setIsSending] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [assignCode, setAssignCode] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [expandedRecent, setExpandedRecent] = useState<string | null>(null);
  const pollingRef = useRef(false);
  const pendingRef = useRef(new Map<string, { size: number; mtime: number; firstSeenAt: number; handle: FileSystemFileHandle }>());
  const fileHandleMap = useRef(new Map<string, FileSystemFileHandle>());

  // Wrap dispatch to also get typed events
  const send = useCallback((event: SessionEvent) => dispatch(event), []);

  // ── Toast helper ───────────────────────────────────────────

  const toast = useCallback((message: string, color: Toast['color'] = 'green') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, color }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // ── Browser support check ──────────────────────────────────

  useEffect(() => {
    setSupported(typeof window.showDirectoryPicker === 'function');
  }, []);

  // ── Restore folder handle from IndexedDB ───────────────────

  useEffect(() => {
    (async () => {
      try {
        const saved = await idbGet<FileSystemDirectoryHandle>('boothFolderHandle');
        if (!saved) return;
        const perm = await saved.requestPermission({ mode: 'read' });
        if (perm === 'granted') {
          setFolderHandle(saved);
          setFolderName(saved.name);
        }
      } catch {
        // No saved handle or permission denied
      }
    })();
  }, []);

  // ── Persist folder handle ──────────────────────────────────

  useEffect(() => {
    if (folderHandle) {
      idbSet('boothFolderHandle', folderHandle);
    }
  }, [folderHandle]);

  // ── Clear selection when session changes ───────────────────

  const prevSessionCode = useRef<string | null>(null);
  useEffect(() => {
    const code = state.currentSession?.code ?? null;
    if (code !== prevSessionCode.current) {
      setSelectedIds(new Set());
      prevSessionCode.current = code;
    }
  }, [state.currentSession?.code]);

  // ── Process a single new file (thumbnail + QR) ─────────────

  const processFile = useCallback(
    async (nf: NewFile) => {
      // Save the handle for later re-read when sending
      fileHandleMap.current.set(nf.id, nf.handle);

      // Skip files with issues
      if (nf.skipReason) return;

      // Thumbnail
      try {
        const thumb = await generateThumbnail(nf.file);
        send({ type: 'THUMBNAIL_READY', fileId: nf.id, dataUrl: thumb });
      } catch {
        // thumbnail failed
      }

      // QR detection
      try {
        const code = await detectQrInJpeg(nf.file);
        send({ type: 'QR_DECODED', fileId: nf.id, code });

        // If valid QR, look up guest
        if (code) {
          try {
            const res = await fetch(`/api/session-lookup?code=${code}`);
            if (res.ok) {
              const data = await res.json();
              send({
                type: 'GUEST_LOOKUP_RESULT',
                code,
                name: data.name,
                email: data.email,
              });
            }
          } catch {
            // lookup failed — guest info stays null
          }
        }
      } catch {
        // QR detection failed
      }
    },
    [send],
  );

  // ── Polling loop ───────────────────────────────────────────

  const poll = useCallback(async () => {
    if (!folderHandle || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const newFiles = await scanFolder(folderHandle, state.seenFileIds, pendingRef.current);
      if (newFiles === null) {
        // Permission lost
        setFolderHandle(null);
        setFolderName('');
        toast('Folder connection lost — click to reselect', 'yellow');
        return;
      }

      // Filter to processable files only
      const processable = newFiles.filter((f) => !f.skipReason);

      if (processable.length > 0) {
        send({
          type: 'FILES_DETECTED',
          files: processable.map((f) => ({ id: f.id, file: f.file })),
          now: Date.now(),
        });
        for (const nf of processable) {
          processFile(nf);
        }
      }

      // Also mark skipped files as seen so they don't re-appear
      for (const nf of newFiles) {
        if (nf.skipReason) {
          state.seenFileIds.add(nf.id);
        }
      }

      setPollCount((c) => c + 1);
      send({ type: 'TICK', now: Date.now() });
    } catch (err) {
      console.error('[booth-live] poll error', err);
    } finally {
      pollingRef.current = false;
    }
  }, [folderHandle, state.seenFileIds, send, processFile, toast]);

  useEffect(() => {
    if (!folderHandle) return;
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [folderHandle, poll]);

  // ── Folder picker ──────────────────────────────────────────

  const onPickFolder = async () => {
    const h = await pickFolder();
    if (h) {
      setFolderHandle(h);
      setFolderName(h.name);
    }
  };

  // ── Send selected photos ───────────────────────────────────

  const onSend = async () => {
    const session = state.currentSession;
    if (!session || selectedIds.size === 0 || isSending) return;

    setIsSending(true);
    try {
      // Collect files in selection order
      const ordered = session.photos.filter((f) => selectedIds.has(f.id));
      if (ordered.length === 0) {
        toast('No photos selected', 'red');
        return;
      }

      // Re-read files from handles for full-res data
      const blobs: string[] = [];
      for (const photo of ordered) {
        const handle = fileHandleMap.current.get(photo.id);
        if (!handle) throw new Error(`No handle for ${photo.id}`);
        const file = await handle.getFile();
        const b64 = await fileToBase64(file);
        blobs.push(b64);
      }

      const heroBase64 = blobs[0];
      const code = session.code;

      let res: Response;
      if (sendMode === 'hero' || blobs.length === 1) {
        res = await fetch('/api/deliver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, portraitBase64: heroBase64 }),
        });
      } else {
        res = await fetch('/api/deliver-multi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            heroBase64,
            extrasBase64: blobs.slice(1, 5),
          }),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'send failed');
      }

      send({ type: 'SESSION_SENT', code });
      toast(`Sent to ${data.email || session.guestEmail || code}`, 'green');
      setSelectedIds(new Set());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'send failed';
      send({ type: 'SESSION_FAILED', code: session.code, error: msg });
      toast(`Send failed: ${msg}`, 'red');
    } finally {
      setIsSending(false);
    }
  };

  // ── Assign unclaimed ───────────────────────────────────────

  const onAssign = async () => {
    const code = assignCode.trim().toUpperCase();
    if (!code || selectedIds.size === 0) return;

    setAssignError(null);
    try {
      const res = await fetch(`/api/session-lookup?code=${code}`);
      if (!res.ok) {
        setAssignError('Guest not found for that code');
        return;
      }
      send({
        type: 'MANUAL_ASSIGN_UNCLAIMED',
        fileIds: Array.from(selectedIds),
        code,
      });
      setSelectedIds(new Set());
      setAssignCode('');
      toast(`Assigned ${selectedIds.size} photo(s) to ${code}`, 'green');
    } catch {
      setAssignError('Lookup failed');
    }
  };

  // ── Auto-send (fires when reducer sets pendingAutoSend) ─────

  const autoSendRef = useRef(false);
  useEffect(() => {
    if (!state.pendingAutoSend || autoSendRef.current) return;
    const { sessionCode, photos } = state.pendingAutoSend;
    const selected = photos.slice(0, 5);

    autoSendRef.current = true;
    console.log('[auto-send] starting for code', sessionCode, 'with', selected.length, 'photos');
    (async () => {
      try {
        const blobs: string[] = [];
        for (const photo of selected) {
          console.log('[auto-send] preparing', photo.name, 'size:', photo.sizeBytes, 'id:', photo.id);
          const handle = fileHandleMap.current.get(photo.id);
          if (!handle) {
            console.error('[auto-send] NO HANDLE for', photo.id, '— available handles:', Array.from(fileHandleMap.current.keys()).join(', '));
            throw new Error(`No handle for ${photo.id}`);
          }
          const file = await handle.getFile();
          console.log('[auto-send] read file', photo.name, 'actual size:', file.size);
          const b64 = await fileToBase64(file);
          console.log('[auto-send] encoded', photo.name, 'b64 length:', b64.length);
          blobs.push(b64);
        }

        console.log('[auto-send] POSTing to /api/deliver-multi, code:', sessionCode, 'hero b64 len:', blobs[0]?.length, 'extras:', blobs.length - 1);
        const res = await fetch('/api/deliver-multi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: sessionCode,
            heroBase64: blobs[0],
            extrasBase64: blobs.slice(1, 5),
          }),
        });

        console.log('[auto-send] response status:', res.status);
        const data = await res.json().catch(() => ({}));
        console.log('[auto-send] response body:', JSON.stringify(data));
        if (!res.ok) throw new Error(`API returned ${res.status}: ${JSON.stringify(data)}`);

        send({ type: 'SESSION_SENT', code: sessionCode });
        toast(`Auto-sent to ${data.email || sessionCode}`, 'green');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'auto-send failed';
        console.error('[auto-send] FAILED:', err);
        send({ type: 'SESSION_FAILED', code: sessionCode, error: msg });
        toast(`Auto-send failed: ${msg}`, 'red');
      } finally {
        autoSendRef.current = false;
      }
    })();
  }, [state.pendingAutoSend, send, toast]);

  // ── Send now (orphan recovery for timed_out sessions) ──────

  const onSendNow = async (session: { code: string; photos: import('@/lib/watcher/types').WatchedFile[] }) => {
    const selected = session.photos.slice(0, 5);
    if (selected.length === 0) return;

    console.log('[send-now] starting for code', session.code, 'with', selected.length, 'photos');
    try {
      const blobs: string[] = [];
      for (const photo of selected) {
        console.log('[send-now] preparing', photo.name, 'size:', photo.sizeBytes, 'id:', photo.id);
        const handle = fileHandleMap.current.get(photo.id);
        if (!handle) {
          console.error('[send-now] NO HANDLE for', photo.id, '— available handles:', Array.from(fileHandleMap.current.keys()).join(', '));
          throw new Error(`No handle for ${photo.id}`);
        }
        const file = await handle.getFile();
        console.log('[send-now] read file', photo.name, 'actual size:', file.size);
        const b64 = await fileToBase64(file);
        blobs.push(b64);
      }

      console.log('[send-now] POSTing to /api/deliver-multi, code:', session.code);
      const res = await fetch('/api/deliver-multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: session.code,
          heroBase64: blobs[0],
          extrasBase64: blobs.slice(1, 5),
        }),
      });

      console.log('[send-now] response status:', res.status);
      const data = await res.json().catch(() => ({}));
      console.log('[send-now] response body:', JSON.stringify(data));
      if (!res.ok) throw new Error(`API returned ${res.status}: ${JSON.stringify(data)}`);

      send({ type: 'SESSION_SENT', code: session.code });
      toast(`Sent to ${data.email || session.code}`, 'green');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'send failed';
      console.error('[send-now] FAILED:', err);
      send({ type: 'SESSION_FAILED', code: session.code, error: msg });
      toast(`Send failed: ${msg}`, 'red');
    }
  };

  // ── Resend failed ──────────────────────────────────────────

  const onResend = async (code: string) => {
    try {
      const res = await fetch(`/api/resend?code=${code}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast(`Resent to ${data.email || code}`, 'green');
      } else {
        toast(`Resend failed: ${data.error || 'unknown'}`, 'red');
      }
    } catch {
      toast('Resend failed', 'red');
    }
  };

  // ── Toggle selection ───────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size < 5) next.add(id);
      }
      return next;
    });
  };

  // ── Derived values ─────────────────────────────────────────

  const session = state.currentSession;
  const selectionArray = Array.from(selectedIds);

  // ── Render ─────────────────────────────────────────────────

  if (supported === null) return null;

  if (!supported) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold text-red-400">Browser not supported</h1>
          <p className="text-zinc-400">
            This page requires <strong>Google Chrome</strong> or a Chromium-based browser on
            a desktop computer. Safari and Firefox don&apos;t support the file system API we
            need. For manual photo upload instead, go to{' '}
            <a href="/booth" className="text-violet-400 underline">/booth</a>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Toast layer ─────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2 text-sm font-medium rounded shadow-lg ${
              t.color === 'green'
                ? 'bg-green-700 text-white'
                : t.color === 'red'
                  ? 'bg-red-700 text-white'
                  : 'bg-yellow-600 text-black'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-lg font-semibold tracking-wide uppercase">
          booth — live mode
        </h1>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          {folderHandle ? (
            <>
              <span className="text-green-400">watching: {folderName}</span>
              <span>polls: {pollCount}</span>
              <span>files: {state.seenFileIds.size}</span>
              <button
                type="button"
                onClick={() => send({ type: 'TOGGLE_AUTO_MODE' })}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors ${
                  state.autoModeEnabled
                    ? 'bg-green-700 text-green-100'
                    : 'bg-zinc-700 text-zinc-400'
                }`}
              >
                auto: {state.autoModeEnabled ? 'on' : 'off'}
              </button>
              {state.cameraDisconnectedAt && (
                <span className="text-yellow-400 font-medium">
                  ⚠ no new photos for {ago(state.lastPhotoSeenAt!)}
                </span>
              )}
              <button
                type="button"
                onClick={onPickFolder}
                className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
              >
                change
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onPickFolder}
              className="px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-sm font-medium"
            >
              select watched folder
            </button>
          )}
        </div>
      </header>

      {/* ── Session banner ──────────────────────────────────── */}
      {session && (
        <div
          className={`px-6 py-3 flex items-center justify-between flex-wrap gap-2 text-sm ${
            session.status === 'failed'
              ? 'bg-red-900/60'
              : session.status === 'sent'
                ? 'bg-green-900/60'
                : 'bg-green-900/40'
          }`}
        >
          <div>
            <span className="font-semibold">
              session: {session.guestName || session.code}
              {session.guestName && (
                <span className="text-zinc-400 font-normal"> ({session.code})</span>
              )}
            </span>
            {!session.guestName && (
              <span className="text-zinc-400 ml-2">loading guest info...</span>
            )}
            {session.guestEmail && (
              <span className="text-zinc-400 ml-3">{session.guestEmail}</span>
            )}
            <span className="text-zinc-500 ml-3">
              last photo: {ago(session.lastPhotoAt)}
            </span>
            {session.status === 'failed' && session.errorMessage && (
              <span className="text-red-300 ml-3">error: {session.errorMessage}</span>
            )}
            {state.autoModeEnabled && session.status === 'active' && (
              <span className="text-green-300 ml-3">auto-send when next QR arrives</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => send({ type: 'MANUAL_CLOSE_SESSION' })}
            className="text-xs text-zinc-300 hover:text-white underline underline-offset-2"
          >
            close session
          </button>
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────── */}
      <div className="border-b border-zinc-800 px-6 flex gap-6">
        {(
          [
            ['current', 'Current'],
            ['unclaimed', `Unclaimed (${state.unclaimed.length})`],
            ['recent', 'Recent sends'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setActiveTab(key);
              setSelectedIds(new Set());
            }}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-violet-500 text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────── */}
      <div className="px-6 py-6">
        {/* ── CURRENT TAB ─────────────────────────────────── */}
        {activeTab === 'current' && (
          <>
            {!session && (
              <p className="text-zinc-500 text-sm">
                Waiting for next guest. Photographer takes a binding shot (with QR
                visible) to start a session.
              </p>
            )}

            {session && (
              <>
                {session.photos.length === 0 ? (
                  <p className="text-zinc-500 text-sm">
                    Session started — waiting for portrait photos...
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {session.photos.map((f) => {
                      const selected = selectedIds.has(f.id);
                      const order = selected ? selectionArray.indexOf(f.id) + 1 : 0;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => toggleSelect(f.id)}
                          className={`relative bg-zinc-900 border-2 p-1 transition-colors ${
                            selected
                              ? 'border-violet-500'
                              : 'border-zinc-800 hover:border-zinc-600'
                          }`}
                        >
                          {f.thumbnailDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={f.thumbnailDataUrl}
                              alt={f.name}
                              className="w-full aspect-[3/4] object-cover"
                            />
                          ) : (
                            <div className="w-full aspect-[3/4] bg-zinc-800 animate-pulse" />
                          )}
                          {selected && order <= 5 && (
                            <span className="absolute top-2 right-2 bg-violet-600 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full">
                              {order}
                            </span>
                          )}
                          <p className="text-[10px] text-zinc-500 truncate mt-1">{f.name}</p>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Send controls */}
                <div className="mt-6 flex items-center gap-4 flex-wrap">
                  <span className="text-sm text-zinc-400">
                    {selectedIds.size} selected
                  </span>
                  <select
                    value={sendMode}
                    onChange={(e) => setSendMode(e.target.value as 'hero' | 'extras')}
                    className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-1.5 rounded-none"
                  >
                    <option value="hero">Hero only (single photo)</option>
                    <option value="extras">Hero + extras (up to 5 total)</option>
                  </select>
                  <button
                    type="button"
                    disabled={selectedIds.size === 0 || isSending}
                    onClick={onSend}
                    className="px-5 py-2 bg-violet-700 hover:bg-violet-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium transition-colors"
                  >
                    {isSending ? 'sending...' : 'send selected'}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── UNCLAIMED TAB ───────────────────────────────── */}
        {activeTab === 'unclaimed' && (
          <>
            {state.unclaimed.length === 0 ? (
              <p className="text-zinc-500 text-sm">
                No unclaimed photos. Photos without a QR-bound session appear here.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {state.unclaimed.map((f) => {
                    const selected = selectedIds.has(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleSelect(f.id)}
                        className={`relative bg-zinc-900 border-2 p-1 transition-colors ${
                          selected
                            ? 'border-violet-500'
                            : 'border-zinc-800 hover:border-zinc-600'
                        }`}
                      >
                        {f.thumbnailDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={f.thumbnailDataUrl}
                            alt={f.name}
                            className="w-full aspect-[3/4] object-cover"
                          />
                        ) : (
                          <div className="w-full aspect-[3/4] bg-zinc-800 animate-pulse" />
                        )}
                        <p className="text-[10px] text-zinc-500 truncate mt-1">{f.name}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-zinc-400">
                    {selectedIds.size} selected
                  </span>
                  <input
                    type="text"
                    placeholder="guest code"
                    value={assignCode}
                    onChange={(e) => setAssignCode(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-1.5 w-28 rounded-none uppercase placeholder:normal-case"
                  />
                  <button
                    type="button"
                    disabled={selectedIds.size === 0 || !assignCode.trim()}
                    onClick={onAssign}
                    className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm transition-colors"
                  >
                    assign
                  </button>
                  {assignError && (
                    <span className="text-red-400 text-sm">{assignError}</span>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ── RECENT SENDS TAB ────────────────────────────── */}
        {activeTab === 'recent' && (
          <>
            {state.recentSessions.length === 0 ? (
              <p className="text-zinc-500 text-sm">
                No recent sessions yet. Completed or timed-out sessions appear here.
              </p>
            ) : (
              <div className="space-y-1">
                {/* Table header */}
                <div className="grid grid-cols-[80px_80px_1fr_1fr_80px_60px_60px] gap-2 text-xs text-zinc-500 font-medium px-2 py-1 border-b border-zinc-800">
                  <span>time</span>
                  <span>code</span>
                  <span>name</span>
                  <span>email</span>
                  <span>status</span>
                  <span>photos</span>
                  <span></span>
                </div>
                {state.recentSessions.map((s) => (
                  <div key={`${s.code}-${s.startedAt}`}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedRecent(
                          expandedRecent === s.code ? null : s.code,
                        )
                      }
                      className="w-full grid grid-cols-[80px_80px_1fr_1fr_80px_60px_60px] gap-2 text-xs px-2 py-2 hover:bg-zinc-900 transition-colors text-left"
                    >
                      <span className="text-zinc-500">
                        {s.sentAt ? ago(s.sentAt) : ago(s.startedAt)}
                      </span>
                      <span className="font-mono text-zinc-300">{s.code}</span>
                      <span className="text-zinc-300 truncate">{s.guestName || '—'}</span>
                      <span className="text-zinc-500 truncate">{s.guestEmail || '—'}</span>
                      <span>
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded ${
                            s.status === 'sent'
                              ? 'bg-green-900 text-green-300'
                              : s.status === 'failed'
                                ? 'bg-red-900 text-red-300'
                                : s.status === 'sending'
                                  ? 'bg-yellow-900 text-yellow-300'
                                  : 'bg-zinc-700 text-zinc-400'
                          }`}
                        >
                          {s.status}
                        </span>
                      </span>
                      <span className="text-zinc-500">{s.photos.length}</span>
                      <span>
                        {s.status === 'failed' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onResend(s.code);
                            }}
                            className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
                          >
                            resend
                          </button>
                        )}
                        {s.status === 'timed_out' && s.photos.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSendNow(s);
                            }}
                            className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
                          >
                            send now
                          </button>
                        )}
                      </span>
                    </button>
                    {expandedRecent === s.code && s.photos.length > 0 && (
                      <div className="px-2 pb-3 flex gap-2 flex-wrap">
                        {s.photos.map((f) => (
                          <div key={f.id} className="w-16 h-20 bg-zinc-800 overflow-hidden">
                            {f.thumbnailDataUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={f.thumbnailDataUrl}
                                alt={f.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-zinc-800" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
