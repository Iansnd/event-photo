import sharp from 'sharp';
import path from 'path';

const TEMPLATE_PATH = path.join(process.cwd(), 'public/brand/template.png');

// Template: 1080×1920
// Photo window: 965×1190, inset 57px from top and both sides
// Bottom 690px is fixed Calvin Klein Euphoria branding — do not touch
export const PORTRAIT_X = 57;
export const PORTRAIT_Y = 57;
export const PORTRAIT_W = 965;
export const PORTRAIT_H = 1190;

export async function composite(portraitBuffer: Buffer): Promise<Buffer> {
  const resized = await sharp(portraitBuffer)
    .rotate() // respect EXIF orientation
    .resize(PORTRAIT_W, PORTRAIT_H, { fit: 'cover', position: 'centre' })
    .toBuffer();

  return sharp(TEMPLATE_PATH)
    .composite([{ input: resized, left: PORTRAIT_X, top: PORTRAIT_Y }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

// Dev helper: draws a red rectangle around the portrait area so you can
// confirm the crop box lines up with the template.
export async function compositeWithGuide(portraitBuffer: Buffer): Promise<Buffer> {
  const resized = await sharp(portraitBuffer)
    .rotate()
    .resize(PORTRAIT_W, PORTRAIT_H, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const guide = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PORTRAIT_W}" height="${PORTRAIT_H}">
      <rect x="0" y="0" width="${PORTRAIT_W}" height="${PORTRAIT_H}"
        fill="none" stroke="red" stroke-width="4"/>
    </svg>`
  );

  return sharp(TEMPLATE_PATH)
    .composite([
      { input: resized, left: PORTRAIT_X, top: PORTRAIT_Y },
      { input: guide, left: PORTRAIT_X, top: PORTRAIT_Y },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}
