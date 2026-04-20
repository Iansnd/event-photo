import nodemailer from 'nodemailer';
import path from 'path';
import { renderEmail } from './email-template';

if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  // Log at import time on the server so misconfiguration is loud.
  console.warn('[mailer] GMAIL_USER / GMAIL_APP_PASSWORD not set — sends will fail');
}

export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER!,
    pass: process.env.GMAIL_APP_PASSWORD!,
  },
});

export async function sendPhotoEmail(opts: {
  to: string;
  name: string;
  photoUrl: string;
  previewUrl: string;
  previewBuffer?: Buffer;
  extrasCount?: number;
}) {
  const fromName = process.env.GMAIL_FROM_NAME ?? 'Calvin Klein Euphoria';

  // Resolve email asset paths on disk
  const assetsDir = path.join(process.cwd(), 'public', 'email-assets');
  const attachments: nodemailer.SendMailOptions['attachments'] = [
    { filename: 'Hero_Image.png', path: path.join(assetsDir, 'Hero_Image.png'), cid: 'hero-image' },
    { filename: 'Bottle_1.png', path: path.join(assetsDir, 'Bottle_1.png'), cid: 'bottle-1' },
    { filename: 'Bottle_2.png', path: path.join(assetsDir, 'Bottle_2.png'), cid: 'bottle-2' },
    { filename: 'Bottle_3.png', path: path.join(assetsDir, 'Bottle_3.png'), cid: 'bottle-3' },
    { filename: 'CK_LOGO.png', path: path.join(process.cwd(), 'public', 'brand', 'CK_LOGO.png'), cid: 'ck-logo' },
  ];

  // If we have the composited photo buffer, embed it as CID too
  let previewSrc = opts.previewUrl;
  if (opts.previewBuffer) {
    const guestCid = 'guest-photo';
    attachments.push({
      filename: 'guest-photo.jpg',
      content: opts.previewBuffer,
      cid: guestCid,
    });
    previewSrc = `cid:${guestCid}`;
  }

  return transporter.sendMail({
    from: `"${fromName}" <${process.env.GMAIL_USER}>`,
    to: opts.to,
    subject: 'your photo from euphoria',
    html: renderEmail({
      name: opts.name,
      photoUrl: opts.photoUrl,
      previewUrl: previewSrc,
      extrasCount: opts.extrasCount,
    }),
    attachments,
  });
}
