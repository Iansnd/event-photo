const IMAGE_RE = /\.(jpe?g|png|heic|heif)$/i;

// Minimum age in ms before we pick up a file (avoids half-written Canon tether files)
const MIN_AGE_MS = 500;

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
 * Returns files with a fileType and optional skipReason for files that
 * were detected but can't be processed (0-byte, still writing, HEIC, etc.).
 * Returns null if the directory is no longer accessible.
 */
export async function scanFolder(
  handle: FileSystemDirectoryHandle,
  seen: Set<string>,
): Promise<NewFile[] | null> {
  const newFiles: NewFile[] = [];
  const now = Date.now();

  try {
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file') continue;
      if (!IMAGE_RE.test(entry.name)) continue;

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

      // Determine skip reason (if any)
      let skipReason: string | undefined;

      if (file.size === 0) {
        skipReason =
          'iCloud stub — right-click in Finder → Download Now';
      } else if (now - file.lastModified < MIN_AGE_MS) {
        skipReason = 'file still being written';
      } else if (fileType === 'heic') {
        skipReason =
          'HEIC not supported in browser — please configure EOS Utility to save JPEG format instead. See camera settings.';
      }

      newFiles.push({ id, name: file.name, file, handle: entry, fileType, skipReason });
    }
  } catch (err) {
    console.error('[watcher] scanFolder failed (permission revoked?):', err);
    return null;
  }

  return newFiles;
}
