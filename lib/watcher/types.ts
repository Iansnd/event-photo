export type WatchedFile = {
  id: string; // `${name}:${lastModified}:${size}`
  name: string;
  createdAt: number;
  sizeBytes: number;
  thumbnailDataUrl: string;
  qrCode: string | null;
  processed: boolean;
  fileHandle: FileSystemFileHandle; // re-read when sending
  excluded?: boolean;
};

export type LiveSession = {
  code: string;
  guestName: string | null;
  guestEmail: string | null;
  startedAt: number;
  lastPhotoAt: number;
  bindingPhotoId: string;
  photos: WatchedFile[]; // non-QR portrait photos in this session
  status: 'active' | 'sending' | 'sent' | 'failed' | 'timed_out';
  sentAt?: number;
  errorMessage?: string;
};

export type WatcherState = {
  folderHandle: FileSystemDirectoryHandle | null;
  folderName: string;
  seenFileIds: Set<string>;
  currentSession: LiveSession | null;
  recentSessions: LiveSession[]; // last 20
  unclaimed: WatchedFile[];
  lastPollAt: number;
  lastPhotoSeenAt: number | null;
  cameraDisconnectedAt: number | null;
  autoModeEnabled: boolean;
  pendingAutoSend: { sessionCode: string; photos: WatchedFile[] } | null;
};

export type SessionEvent =
  | { type: 'FILES_DETECTED'; files: { id: string; file: File }[]; now: number }
  | { type: 'QR_DECODED'; fileId: string; code: string | null }
  | { type: 'THUMBNAIL_READY'; fileId: string; dataUrl: string }
  | { type: 'GUEST_LOOKUP_RESULT'; code: string; name: string | null; email: string | null }
  | { type: 'SESSION_SENT'; code: string }
  | { type: 'SESSION_FAILED'; code: string; error: string }
  | { type: 'MANUAL_CLOSE_SESSION' }
  | { type: 'MANUAL_ASSIGN_UNCLAIMED'; fileIds: string[]; code: string }
  | { type: 'TICK'; now: number }
  | { type: 'TOGGLE_AUTO_MODE' }
  | { type: 'CLEAR_PENDING_AUTO_SEND' }
  | { type: 'EXCLUDE_PHOTO'; fileId: string };

export function emptyState(): WatcherState {
  return {
    folderHandle: null,
    folderName: '',
    seenFileIds: new Set(),
    currentSession: null,
    recentSessions: [],
    unclaimed: [],
    lastPollAt: 0,
    lastPhotoSeenAt: null,
    cameraDisconnectedAt: null,
    autoModeEnabled: true,
    pendingAutoSend: null,
  };
}
