import { renderEmail } from '../lib/email-template';
import fs from 'fs';

// Set env var so the template can resolve it
process.env.NEXT_PUBLIC_EVENT_NAME = process.env.NEXT_PUBLIC_EVENT_NAME ?? 'Euphoria Launch';

const rendered = renderEmail({
  name: 'Sarah Jones',
  photoUrl: 'https://event-photo-six.vercel.app/p/ABCD23',
  previewUrl: 'https://event-photo-six.vercel.app/email-assets/Hero_Image.png',
  viewUrl: 'https://event-photo-six.vercel.app/p/ABCD23',
  extrasCount: 0,
});

fs.writeFileSync('./email-test-render.html', rendered);
console.log('Wrote email-test-render.html (no extras)');

// Also render with extras to verify the extras block
const renderedWithExtras = renderEmail({
  name: 'Sarah Jones',
  photoUrl: 'https://event-photo-six.vercel.app/p/ABCD23',
  previewUrl: 'https://event-photo-six.vercel.app/email-assets/Hero_Image.png',
  viewUrl: 'https://event-photo-six.vercel.app/p/ABCD23',
  extrasCount: 3,
});

fs.writeFileSync('./email-test-render-extras.html', renderedWithExtras);
console.log('Wrote email-test-render-extras.html (3 extras)');
