import fs from 'fs';
import path from 'path';

function readTemplate(filename: string): string {
  const templatePath = path.join(process.cwd(), 'public', 'brand', filename);
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Missing email template: ${filename}. Expected at ${templatePath}`
    );
  }
  return fs.readFileSync(templatePath, 'utf-8');
}

function replaceTokens(template: string, tokens: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(tokens)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    output = output.replace(regex, value);
  }
  return output;
}

function firstNameFrom(fullName: string): string {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return '';
  const first = trimmed.split(/\s+/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function renderEmail(opts: {
  name: string;
  photoUrl: string;
  previewUrl: string;
  viewUrl?: string;
  extrasCount?: number;
}): string {
  const mainTemplate = readTemplate('email.html');
  const extrasCount = opts.extrasCount ?? 0;
  const firstName = firstNameFrom(opts.name);

  let extrasBlock = '';
  if (extrasCount > 0) {
    const extrasTemplate = readTemplate('email-extras-block.html');
    // Strip HTML comments from the snippet so they don't break
    // the parent template's own comment wrapping {{EXTRAS_BLOCK}}
    const stripped = extrasTemplate.replace(/<!--[\s\S]*?-->/g, '').trim();
    extrasBlock = replaceTokens(stripped, {
      EXTRAS_COUNT: String(extrasCount),
    });
  }

  return replaceTokens(mainTemplate, {
    GUEST_NAME: firstName,
    PREVIEW_URL: opts.previewUrl,
    VIEW_URL: opts.viewUrl ?? opts.photoUrl,
    EVENT_NAME: process.env.NEXT_PUBLIC_EVENT_NAME ?? 'Euphoria Launch',
    EXTRAS_COUNT: String(extrasCount),
    EXTRAS_BLOCK: extrasBlock,
  });
}
