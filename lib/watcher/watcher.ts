const IMAGE_RE = /\.(jpe?g|png|heic|heif)$/i;

// File must be unchanged for this long before we process it
const STABLE_MS = 1000;

export type FileType = 'jpeg' | 'png' | 'heic' | 'unknown';

export type NewFile = {
  id: string;
  name: string;
  file: File;
  handle: FileSystemFileHandle;
  fileType: FileType;
  /** If set, this file was detected but cannot be processed. */
  skipReason?: string;
};

type PendingFile = {
  size: number;
  mtime: number;
  firstSeenAt: number;
  handle: FileSystemFileHandle;
};

function detectFileType(name: string): FileType {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'png') return 'png';
  if (ext === 'heic' || ext === 'heif') return 'heic';
  return 'unknown';
}

/**
 * Prompt the user to pick a directory. Returns the handle or null if cancelled.
 */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker!({ mode: 'read' });
  } catch (err) {
    // User cancelled or permission denied
    if (err instanceof DOMException && err.name === 'AbortError') {
      return null;
    }
    console.error('[watcher] pickFolder failed:', err);
    return null;
  }
}

/**
 * Scan a directory handle for new image files not in `seen`.
 * Uses a stable-file check: files must have unchanged (size, lastModified) for
 * at least STABLE_MS before they are returned as ready. Still-changing files
 * are tracked in the `pending` map and re-checked on subsequent polls.
 * Returns null if the directory is no longer accessible.
 */
export async function scanFolder(
  handle: FileSystemDirectoryHandle,
  seen: Set<string>,
  pending: Map<string, PendingFile> = new Map(),
): Promise<NewFile[] | null> {
  const readyFiles: NewFile[] = [];
  const now = Date.now();
  const visitedNames = new Set<string>();

  try {
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file') continue;
      if (!IMAGE_RE.test(entry.name)) continue;
      visitedNames.add(entry.name);

      let file: File;
      try {
        file = await entry.getFile();
      } catch {
        // File may be locked by tether software
        continue;
      }

      const fileType = detectFileType(entry.name);
      const id = `${file.name}:${file.lastModified}:${file.size}`;
      if (seen.has(id)) continue;

      // 0-byte / HEIC — return immediately with skipReason
      if (file.size === 0) {
        readyFiles.push({
          id, name: file.name, file, handle: entry, fileType,
          skipReason: 'iCloud stub — right-click in Finder → Download Now',
        });
        continue;
      }
      if (fileType === 'heic') {
        readyFiles.push({
          id, name: file.name, file, handle: entry, fileType,
          skipReason: 'HEIC not supported in browser — please configure EOS Utility to save JPEG format instead. See camera settings.',
        });
        continue;
      }

      // Stable-file check
      const prev = pending.get(entry.name);
      if (!prev) {
        // First time seeing this file — start tracking
        pending.set(entry.name, {
          size: file.size,
          mtime: file.lastModified,
          firstSeenAt: now,
          handle: entry,
        });
        continue;
      }

      // File changed since last poll — reset tracking
      if (prev.size !== file.size || prev.mtime !== file.lastModified) {
        pending.set(entry.name, {
          size: file.size,
          mtime: file.lastModified,
          firstSeenAt: now,
          handle: entry,
        });
        continue;
      }

      // File stable but not long enough — wait
      if (now - prev.firstSeenAt < STABLE_MS) {
        continue;
      }

      // File is stable — ready to process
      pending.delete(entry.name);
      readyFiles.push({ id, name: file.name, file, handle: entry, fileType });
    }
  } catch (err) {
    console.error('[watcher] scanFolder failed (permission revoked?):', err);
    return null;
  }

  // Clean up pending entries for files that were removed from disk
  for (const name of pending.keys()) {
    if (!visitedNames.has(name)) {
      pending.delete(name);
    }
  }

  return readyFiles;
}
