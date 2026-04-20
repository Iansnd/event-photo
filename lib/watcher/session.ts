import type { WatcherState, WatchedFile, LiveSession, SessionEvent } from './types';

const MAX_RECENT = 20;
const CAMERA_SILENCE_MS = 60_000; // 1 min no files → camera disconnected

/** Valid guest code: exactly 6 alphanumeric characters */
function isValidCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/i.test(code);
}

function pushRecent(sessions: LiveSession[], session: LiveSession): LiveSession[] {
  return [session, ...sessions].slice(0, MAX_RECENT);
}

function fileToWatched(id: string, file: File): WatchedFile {
  return {
    id,
    name: file.name,
    createdAt: file.lastModified,
    sizeBytes: file.size,
    thumbnailDataUrl: '',
    qrCode: null,
    processed: false,
    // Cast — tests pass a stub; real code provides a real handle
    fileHandle: undefined as unknown as FileSystemFileHandle,
  };
}

function makeSession(code: string, bindingFile: WatchedFile, now: number): LiveSession {
  return {
    code,
    guestName: null,
    guestEmail: null,
    startedAt: now,
    lastPhotoAt: now,
    bindingPhotoId: bindingFile.id,
    photos: [],
    status: 'active',
  };
}

function findAndRemove<T extends { id: string }>(arr: T[], id: string): [T | null, T[]] {
  const idx = arr.findIndex((f) => f.id === id);
  if (idx === -1) return [null, arr];
  const found = arr[idx];
  return [found, [...arr.slice(0, idx), ...arr.slice(idx + 1)]];
}

export function reduce(state: WatcherState, event: SessionEvent): WatcherState {
  switch (event.type) {
    // ─── Rule 1 ──────────────────────────────────────────────
    case 'FILES_DETECTED': {
      let { unclaimed, currentSession } = state;
      const newSeen = new Set(state.seenFileIds);
      const newFiles: WatchedFile[] = [];

      for (const { id, file } of event.files) {
        newSeen.add(id);
        const wf = fileToWatched(id, file);
        newFiles.push(wf);
        console.log(
          '[session] file', id, '→',
          currentSession && currentSession.status === 'active'
            ? 'session ' + currentSession.code
            : 'unclaimed',
        );
      }

      if (currentSession && currentSession.status === 'active') {
        currentSession = {
          ...currentSession,
          photos: [...currentSession.photos, ...newFiles],
          lastPhotoAt: event.now,
        };
      } else {
        unclaimed = [...unclaimed, ...newFiles];
      }

      return {
        ...state,
        seenFileIds: newSeen,
        currentSession,
        unclaimed,
        lastPhotoSeenAt: event.now,
      };
    }

    // ─── Rule 2 ──────────────────────────────────────────────
    case 'QR_DECODED': {
      const { fileId, code } = event;

      // No valid code — just tag the file's qrCode field and leave it
      if (!code || !isValidCode(code)) {
        // Try to find in unclaimed
        const unclaimedUpdated = state.unclaimed.map((f) =>
          f.id === fileId ? { ...f, qrCode: code ?? null } : f,
        );
        // Try to find in currentSession.photos
        const session = state.currentSession;
        const sessionUpdated = session
          ? {
              ...session,
              photos: session.photos.map((f) =>
                f.id === fileId ? { ...f, qrCode: code ?? null } : f,
              ),
            }
          : null;
        return { ...state, unclaimed: unclaimedUpdated, currentSession: sessionUpdated };
      }

      // Valid code — find the file
      let file: WatchedFile | null = null;
      let newUnclaimed = state.unclaimed;
      let currentSession = state.currentSession;

      // Check unclaimed first
      [file, newUnclaimed] = findAndRemove(state.unclaimed, fileId);

      // Check currentSession.photos
      if (!file && currentSession) {
        let fromSession: WatchedFile | null;
        let remainingPhotos: WatchedFile[];
        [fromSession, remainingPhotos] = findAndRemove(currentSession.photos, fileId);
        if (fromSession) {
          file = fromSession;
          currentSession = { ...currentSession, photos: remainingPhotos };
        }
      }

      if (!file) return state; // file not found — no-op

      file = { ...file, qrCode: code };

      // Case A: No current session → start new
      if (!currentSession) {
        const now = file.createdAt || Date.now();
        return {
          ...state,
          unclaimed: newUnclaimed,
          currentSession: makeSession(code, file, now),
        };
      }

      // Case B: Same code as current session → update binding
      if (currentSession.code === code) {
        return {
          ...state,
          unclaimed: newUnclaimed,
          currentSession: {
            ...currentSession,
            bindingPhotoId: file.id,
          },
        };
      }

      // Case C: Different code → close old, start new
      const closedSession: LiveSession = {
        ...currentSession,
        status:
          currentSession.status === 'sent' || currentSession.status === 'failed'
            ? currentSession.status
            : 'timed_out',
      };
      const now = file.createdAt || Date.now();
      return {
        ...state,
        unclaimed: newUnclaimed,
        recentSessions: pushRecent(state.recentSessions, closedSession),
        currentSession: makeSession(code, file, now),
      };
    }

    // ─── Rule 3 ──────────────────────────────────────────────
    case 'THUMBNAIL_READY': {
      const { fileId, dataUrl } = event;
      const setThumb = (f: WatchedFile) =>
        f.id === fileId ? { ...f, thumbnailDataUrl: dataUrl } : f;

      return {
        ...state,
        unclaimed: state.unclaimed.map(setThumb),
        currentSession: state.currentSession
          ? {
              ...state.currentSession,
              photos: state.currentSession.photos.map(setThumb),
            }
          : null,
      };
    }

    // ─── Rule 4 ──────────────────────────────────────────────
    case 'GUEST_LOOKUP_RESULT': {
      if (!state.currentSession || state.currentSession.code !== event.code) return state;
      return {
        ...state,
        currentSession: {
          ...state.currentSession,
          guestName: event.name,
          guestEmail: event.email,
        },
      };
    }

    // ─── Rule 5 ──────────────────────────────────────────────
    case 'SESSION_SENT': {
      if (!state.currentSession || state.currentSession.code !== event.code) return state;
      const sent: LiveSession = {
        ...state.currentSession,
        status: 'sent',
        sentAt: Date.now(),
      };
      return {
        ...state,
        currentSession: null,
        recentSessions: pushRecent(state.recentSessions, sent),
      };
    }

    // ─── Rule 6 ──────────────────────────────────────────────
    case 'SESSION_FAILED': {
      if (!state.currentSession || state.currentSession.code !== event.code) return state;
      return {
        ...state,
        currentSession: {
          ...state.currentSession,
          status: 'failed',
          errorMessage: event.error,
        },
      };
    }

    // ─── Rule 7 ──────────────────────────────────────────────
    case 'MANUAL_CLOSE_SESSION': {
      if (!state.currentSession) return state;
      const closed: LiveSession = {
        ...state.currentSession,
        status: 'timed_out',
      };
      return {
        ...state,
        currentSession: null,
        recentSessions: pushRecent(state.recentSessions, closed),
      };
    }

    // ─── Rule 8 ──────────────────────────────────────────────
    case 'MANUAL_ASSIGN_UNCLAIMED': {
      const fileIds = new Set(event.fileIds);
      const moving = state.unclaimed.filter((f) => fileIds.has(f.id));
      const remaining = state.unclaimed.filter((f) => !fileIds.has(f.id));

      if (moving.length === 0) return state;

      // If current session matches the code, append there
      if (state.currentSession && state.currentSession.code === event.code) {
        return {
          ...state,
          unclaimed: remaining,
          currentSession: {
            ...state.currentSession,
            photos: [...state.currentSession.photos, ...moving],
          },
        };
      }

      // Otherwise, find matching recent session and append
      const updatedRecent = state.recentSessions.map((s) =>
        s.code === event.code ? { ...s, photos: [...s.photos, ...moving] } : s,
      );

      return {
        ...state,
        unclaimed: remaining,
        recentSessions: updatedRecent,
      };
    }

    // ─── Rule 9 ──────────────────────────────────────────────
    case 'TICK': {
      // Sessions never auto-close — only explicit events close them
      // (QR_DECODED with different code, SESSION_SENT, MANUAL_CLOSE_SESSION)

      // Camera disconnection detection
      let { cameraDisconnectedAt } = state;
      if (state.lastPhotoSeenAt !== null && event.now - state.lastPhotoSeenAt > CAMERA_SILENCE_MS) {
        cameraDisconnectedAt = cameraDisconnectedAt ?? event.now;
      } else {
        cameraDisconnectedAt = null;
      }

      return {
        ...state,
        lastPollAt: event.now,
        cameraDisconnectedAt,
      };
    }

    default:
      return state;
  }
}
