import nodemailer from 'nodemailer';
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
  extrasCount?: number;
}) {
  const fromName = process.env.GMAIL_FROM_NAME ?? 'Calvin Klein Euphoria';
  return transporter.sendMail({
    from: `"${fromName}" <${process.env.GMAIL_USER}>`,
    to: opts.to,
    subject: 'your photo from euphoria',
    html: renderEmail({
      name: opts.name,
      photoUrl: opts.photoUrl,
      previewUrl: opts.previewUrl,
      extrasCount: opts.extrasCount,
    }),
  });
}
