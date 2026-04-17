/**
 * Generate a 300px-wide JPEG thumbnail as a data URL.
 * Returns a placeholder string on failure so the UI always has something to show.
 */
export async function generateThumbnail(blob: Blob): Promise<string> {
  try {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);

    const TARGET_W = 300;
    const scale = TARGET_W / img.width;
    const canvas = document.createElement('canvas');
    canvas.width = TARGET_W;
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return placeholderThumb();
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.75);
  } catch (err) {
    console.error('[thumbnail] generation failed:', err);
    return placeholderThumb();
  }
}

function placeholderThumb(): string {
  // 1x1 grey pixel as data URL
  return 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
}
