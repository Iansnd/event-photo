import fs from 'fs';
import path from 'path';
import { composite } from '../lib/composite';

async function main() {
  const inPath = path.resolve('./test-portrait.jpg');
  const outPath = path.resolve('./test-output.jpg');

  if (!fs.existsSync(inPath)) {
    console.error(`Missing ${inPath}. Put a vertical portrait JPEG there and re-run.`);
    process.exit(1);
  }

  const input = fs.readFileSync(inPath);
  const output = await composite(input);
  fs.writeFileSync(outPath, output);
  console.log(`Wrote ${outPath} (${output.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
