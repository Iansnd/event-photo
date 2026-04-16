import fs from 'fs';
import sharp from 'sharp';

async function main() {
  // 1000x1250 (4:5) with gradient + text so composite placement is visible.
  const width = 1000;
  const height = 1250;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3b1d7a"/>
        <stop offset="100%" stop-color="#0b0520"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect x="10" y="10" width="${width - 20}" height="${height - 20}" fill="none" stroke="#ffffff" stroke-width="4"/>
    <circle cx="${width / 2}" cy="${height * 0.35}" r="180" fill="#d6c3f2" stroke="#ffffff" stroke-width="6"/>
    <text x="${width / 2}" y="${height - 120}" fill="#ffffff" font-family="sans-serif" font-size="56" text-anchor="middle" font-weight="700">TEST PORTRAIT</text>
    <text x="${width / 2}" y="${height - 60}" fill="#cfc2ec" font-family="sans-serif" font-size="28" text-anchor="middle">composite pipeline check</text>
  </svg>`;

  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  fs.writeFileSync('./test-portrait.jpg', buf);
  console.log('Wrote ./test-portrait.jpg', buf.length, 'bytes');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
