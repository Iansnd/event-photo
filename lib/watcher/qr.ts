import jsQR from 'jsqr';

const QR_CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Detect a 6-char guest QR code in a JPEG blob.
 * Downscales to max 1400px wide for performance (Canon JPEGs can be 20MB+).
 * Returns the uppercase code or null.
 */
export async function detectQrInJpeg(blob: Blob): Promise<string | null> {
  try {
    const img = await blobToImage(blob);
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1400 / img.width);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (!result?.data) return null;
    const trimmed = result.data.trim().toUpperCase();
    return QR_CODE_REGEX.test(trimmed) ? trimmed : null;
  } catch (err) {
    console.error('[qr] detection failed:', err);
    return null;
  }
}
