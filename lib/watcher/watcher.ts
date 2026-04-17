const JPEG_RE = /\.(jpe?g)$/i;

// Minimum age in ms before we pick up a file (avoids half-written Canon tether files)
const MIN_AGE_MS = 500;

export type NewFile = {
  id: string;
  name: string;
  file: File;
  handle: FileSystemFileHandle;
};

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
 * Scan a directory handle for new JPEG files not in `seen`.
 * Skips files that are empty or modified within the last 500ms (half-written).
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
      if (!JPEG_RE.test(entry.name)) continue;

      let file: File;
      try {
        file = await entry.getFile();
      } catch {
        // File may be locked by tether software
        continue;
      }

      // Skip empty files
      if (file.size === 0) continue;

      // Skip files modified within the last 500ms (still being written)
      if (now - file.lastModified < MIN_AGE_MS) continue;

      const id = `${file.name}:${file.lastModified}:${file.size}`;
      if (seen.has(id)) continue;

      newFiles.push({ id, name: file.name, file, handle: entry });
    }
  } catch (err) {
    console.error('[watcher] scanFolder failed (permission revoked?):', err);
    return null;
  }

  return newFiles;
}
