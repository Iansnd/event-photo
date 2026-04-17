export type WatchedFile = {
  id: string; // `${name}:${lastModified}:${size}`
  name: string;
  createdAt: number;
  sizeBytes: number;
  thumbnailDataUrl: string;
  qrCode: string | null;
  processed: boolean;
  fileHandle: FileSystemFileHandle; // re-read when sending
};

export type LiveSession = {
  code: string;
  guestName: string;
  guestEmail: string;
  startedAt: number;
  lastPhotoAt: number;
  bindingPhoto: WatchedFile;
  photos: WatchedFile[]; // non-QR photos in this session
  status: 'active' | 'sent' | 'failed' | 'timed_out';
  sentAt?: number;
};

export type WatcherState = {
  folderHandle: FileSystemDirectoryHandle | null;
  folderName: string;
  seenFileIds: Set<string>;
  currentSession: LiveSession | null;
  recentSessions: LiveSession[]; // last 10
  unclaimed: WatchedFile[];
  lastPollAt: number;
  lastPhotoSeenAt: number | null;
  cameraDisconnectedAt: number | null;
};

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
  };
}
