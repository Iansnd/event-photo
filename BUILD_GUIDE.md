# EVENT PHOTO APP — AGENT BUILD GUIDE

## Calvin Klein × Euphoria Launch, Amsterdam

This document is instructions for **Claude Code** to build an event photo delivery web app autonomously. Work through it top to bottom. Do not skip phases. Do not combine phases. Stop at the checkpoints, verify, then continue.

---

## MISSION

Build a Next.js 15 web app deployed on Vercel that:

1. Lets guests check in on an iPad with name + email, generates a QR code
2. Lets a photographer at a laptop scan the binding shot, match the guest, upload a portrait, and send a branded email
3. Composites the portrait into a Calvin Klein Euphoria template and emails it via Gmail
4. Delivers the photo to the guest at a viewer URL with download + share
5. Provides admin and ops panels for monitoring and emergency recovery

**Stack:** Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui + Supabase (DB + Storage) + Sharp + Nodemailer (Gmail) + Vercel

**Constraints:** Must be stable for 3 days with ~400 guests. Guest-facing screens must look like Calvin Klein campaign pages (dark, editorial, restrained). Booth/admin/ops screens are utilitarian.

---

## OPERATING PRINCIPLES FOR THE AGENT

1. **Run the user's commands yourself.** Install tools, run git, run vercel CLI. Only pause when a browser auth flow or password is required from the user.
2. **Verify before proceeding.** After each phase, print a verification table showing what works. Don't continue past a broken checkpoint.
3. **Paste errors verbatim.** If something fails, show the user the exact error output, then propose a fix.
4. **Commit and push frequently.** At the end of every phase, commit with a meaningful message and push to main.
5. **Ask once, remember forever.** When you need a value from the user (e.g., env var), ask once, save it to `.env.local`, and don't ask again.
6. **No placeholders in production.** Every env var on Vercel must have a real value before the final deploy.

---

## PHASE 0 — TOOLING SETUP

Goal: ensure all CLIs are installed and authenticated so subsequent phases can run autonomously.

### 0.1 — Verify and install prerequisites

Check each of the following. Install what's missing. Print a status table at the end.

| Tool | Check command | Install if missing |
|------|--------------|-------------------|
| Homebrew | `which brew` | `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` |
| Node.js 20+ | `node -v` | `brew install node` |
| Git | `git --version` | `brew install git` |
| GitHub CLI | `gh --version` | `brew install gh` |
| Vercel CLI | `vercel --version` | `brew install vercel` (fallback: `npm install -g vercel`) |
| tsx | `tsx --version` | `npm install -g tsx` |

If Homebrew installation is triggered, pause and tell the user: "Homebrew is installing. It will ask for your Mac password in Terminal — type it (characters won't show) and press Enter."

### 0.2 — Authenticate CLIs

**GitHub CLI:**
```bash
gh auth status
```
If not authenticated, run `gh auth login` and instruct the user:
> Select: GitHub.com → HTTPS → Yes authenticate Git → Login with a web browser. Copy the one-time code shown, press Enter, paste code in browser, click Authorize. Return and say "done".

Pause until user confirms.

**Vercel CLI:**
```bash
vercel whoami
```
If not authenticated, run `vercel login` and instruct the user:
> Enter your email. Vercel sends a link. Click it. Return and say "done".

Pause until user confirms.

### 0.3 — Git identity

```bash
git config --global user.name
git config --global user.email
```
If either is empty, ask the user for their name and GitHub email, then set them globally.

### 0.4 — Project folder

Confirm the current working directory with `pwd`. It should be an empty or near-empty folder dedicated to this project (e.g., `~/Code/event-photo`). If not empty, ask the user what to do with existing contents before proceeding.

### 0.5 — Status table

Print a final table:

```
TOOL         VERSION       AUTH              READY
brew         x.x.x         n/a               yes
node         v20.x.x       n/a               yes
git          x.x.x         configured        yes
gh           x.x.x         <username>        yes
vercel       x.x.x         <email>           yes
tsx          x.x.x         n/a               yes

MCPs connected: supabase (confirmed by user), [others if available]
Working directory: /Users/<user>/Code/event-photo (empty: yes/no)
```

**Checkpoint 0:** All tools installed and authenticated. Stop and tell the user "Phase 0 complete. Ready for Phase 1?" Wait for confirmation.

---

## PHASE 1 — SECRETS + SCAFFOLD + DEPLOY

Goal: create the Next.js app, push to GitHub, deploy to Vercel, all env vars in place, homepage live.

### 1.1 — Collect secrets from the user

Ask the user to provide the following values. If any are missing, pause and instruct them how to obtain each:

**Gmail (app password):**
- `GMAIL_USER` — their Gmail address
- `GMAIL_APP_PASSWORD` — 16-character app password. To obtain: myaccount.google.com → Security → 2-Step Verification must be ON → search "App passwords" → create one named "event-photo" → copy the 16 characters.
- `GMAIL_FROM_NAME` — default to `Calvin Klein Euphoria`

**Supabase (via Supabase MCP — agent creates project):**

Using the Supabase MCP, create a new project:
- Name: `event-photo`
- Region: `eu-central-1` (fallback `eu-west-1`)

Then run this SQL on the new project:

```sql
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  email text not null,
  created_at timestamptz default now(),
  portrait_path text,
  composited_path text,
  sent_at timestamptz,
  status text default 'checked_in' check (status in ('checked_in','shot','sent','failed'))
);
create index guests_code_idx on public.guests(code);
create index guests_created_at_idx on public.guests(created_at desc);
```

Then create a storage bucket named `photos` with public read access.

Capture:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Fixed values:**
- `NEXT_PUBLIC_EVENT_NAME` = `Euphoria Launch`
- `OPS_PASSWORD` = `euphoria2026`
- `NEXT_PUBLIC_APP_URL` = leave empty for now, will be set after Vercel deploy

### 1.2 — Verify template asset

Ask the user where `template.png` is. Confirm with:
```bash
sips -g pixelWidth -g pixelHeight <path>
```

Must be exactly **1080 × 1920**. If not, stop and tell the user they have the wrong file.

### 1.3 — Scaffold the Next.js app

In the current directory:

- Initialize Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui
- Install dependencies: `@supabase/supabase-js qrcode jsqr sharp nanoid nodemailer @types/nodemailer @types/qrcode`

Create these files:

**`lib/supabase.ts`** — exports:
- `supabaseAnon` — browser-safe client using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `supabaseAdmin` — server-only client using `SUPABASE_SERVICE_ROLE_KEY`, throws at import time if key missing

**`.env.local.example`** — documents all 9 required vars with empty values and comments

**`.env.local`** — actual file with real values filled in from Step 1.1

**`app/page.tsx`** — minimal homepage with two plain buttons linking to `/checkin` and `/booth` (utilitarian, no styling)

**`public/brand/README.md`** — note that `template.png` goes here

**`public/brand/template.png`** — copy from the user's path (Step 1.2)

**`.gitignore`** — excludes `.env.local`, `.env`, `node_modules`, `.next`, `.vercel`, `.DS_Store`

**`next.config.js`** — `images.remotePatterns` allowing the Supabase storage domain (extract hostname from `NEXT_PUBLIC_SUPABASE_URL`)

### 1.4 — Git init and push to GitHub

```bash
git init
git add .
git commit -m "initial scaffold"
gh repo create event-photo --private --source=. --remote=origin --push
```

Capture the resulting repo URL.

### 1.5 — Create Vercel project and deploy

```bash
# Link current dir to a new Vercel project
vercel link --yes --project event-photo

# Push env vars to Vercel production (pipe non-interactively)
# For each env var, run:
printf '%s' "$VALUE" | vercel env add VAR_NAME production
```

Add all 9 env vars. For `NEXT_PUBLIC_APP_URL`, use `https://placeholder.vercel.app` temporarily.

```bash
# First deploy
vercel --prod --yes
```

Capture the production URL from the deploy output (e.g., `https://event-photo-abc123.vercel.app`).

### 1.6 — Update NEXT_PUBLIC_APP_URL and redeploy

```bash
# Remove the placeholder
vercel env rm NEXT_PUBLIC_APP_URL production --yes

# Add the real one
printf '%s' "https://event-photo-abc123.vercel.app" | vercel env add NEXT_PUBLIC_APP_URL production

# Also update .env.local locally
# (write the file with the new URL)

# Redeploy so the env var is baked in
vercel --prod --yes --force
```

### 1.7 — Verification

- `curl -I https://<production-url>` returns 200
- Homepage HTML contains "Check-in" and "Booth" button text
- Supabase dashboard shows `guests` table and `photos` bucket
- All 9 env vars are set on Vercel (verify with `vercel env ls production`)

**Checkpoint 1:** Print a summary:
```
GitHub repo: https://github.com/<user>/event-photo
Vercel URL: https://<production-url>
Env vars on Vercel: 9/9 set
Homepage: 200 OK
Supabase table: guests (ready)
Supabase bucket: photos (public)
Template: public/brand/template.png (1080×1920)
```

Commit any local changes, push. Tell the user "Phase 1 complete. Ready for Phase 2?" Wait for confirmation.

---

## PHASE 2 — CHECK-IN PAGE (GUEST-FACING, EUPHORIA-STYLED)

Goal: beautiful iPad check-in screen that creates guest records and displays a scannable QR code.

### 2.1 — Build `/api/checkin` (POST)

- Body: `{ name, email }`
- Validate: both non-empty, email contains `@`, trim whitespace, lowercase email
- Generate 6-char uppercase code via `nanoid` with custom alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous chars)
- Insert row with `status = 'checked_in'` via `supabaseAdmin`
- Retry up to 3 times on unique code collision
- Return `{ code, name }`
- Return 400/500 with readable JSON error on failures

### 2.2 — Build `/checkin` page (client component)

**Visual direction:** Calvin Klein Euphoria campaign. Pure black background (`#000`). Single accent color: deep violet `#6B2BD9` (use sparingly — focus states, QR tile shadow). Clean modern sans-serif (Inter via `next/font`, system-ui fallback). Lowercase, refined type. Generous negative space. Text white, confident. No emojis, no gradients, no stock icons, no rounded corners above 4px. Fashion editorial, not SaaS. iPad and mobile first.

**Step 1 — form state:**
- Full-bleed black background, full viewport height
- Centered content max-width 480px
- Top: small lowercase label "euphoria", letter-spacing 0.15em
- Larger line below: "tell us who you are" — understated, lowercase
- Two inputs (name, email): transparent background, thin white bottom border (1px), no other borders, white text 18–20px, placeholder `rgba(255,255,255,0.4)`. Generous vertical padding. No border radius.
- Single button "continue" — lowercase, white background, black text, full-width, 0 border radius, 16px vertical padding. Disabled state: `rgba(255,255,255,0.3)` background.
- Tiny footer at bottom center with `NEXT_PUBLIC_EVENT_NAME` in white/30

**Step 2 — QR state:**
- Full-bleed black
- Top: "hi {name}," lowercase white understated
- Subtitle: "hand this to the photographer" in `rgba(255,255,255,0.6)` lowercase
- Centered white tile (pure white bg, 32px padding, `box-shadow: 0 20px 60px rgba(107,43,217,0.3)`) containing QR code rendered via `qrcode` lib at 420px square minimum, error correction level `H`
- Below tile in white/60: the 6-char code in large monospace (24px, letter-spacing 0.2em)
- Bottom: small "start over" text link in white/40, underlined on hover, resets to step 1
- Auto-reset to step 1 after 60 seconds of inactivity

Handle API errors inline in step 1 with a small red message below the form.

### 2.3 — Deploy and verify

- Commit with message "checkin page"
- Push — Vercel auto-deploys
- Wait for deploy to complete (poll with `vercel ls` or visit URL)
- `curl` the `/checkin` URL, confirm 200
- Ask the user to visit `https://<url>/checkin` on their iPad, check in with a test name and their own email, and confirm:
  - Page looks editorial and on-brand
  - QR is visible and scannable with a phone camera from 30cm away
  - New row appears in Supabase `guests` table

If the user reports the QR is hard to scan, increase size to 500px square and push again.

**Checkpoint 2:** User confirms iPad check-in works and QR scans reliably. Tell the user "Phase 2 complete. Ready for Phase 3?" Wait for confirmation.

---

## PHASE 3 — BOOTH + DELIVERY PIPELINE

Goal: photographer workflow that identifies the guest via QR, composites their portrait into the Euphoria template, and sends the email.

### 3.1 — Build `/api/lookup` (GET `?code=X`)

Returns `{ name, email, status }` or 404.

### 3.2 — Build `/api/recent` (GET)

Returns last 10 guest rows ordered by `created_at desc`.

### 3.3 — Build `lib/composite.ts`

```typescript
import sharp from 'sharp';
import path from 'path';

const TEMPLATE_PATH = path.join(process.cwd(), 'public/brand/template.png');

// Template: 1080×1920
// Photo window: 965×1190, inset 57px from top and both sides
// Bottom 690px is fixed Calvin Klein Euphoria branding — do not touch
const PORTRAIT_X = 57;
const PORTRAIT_Y = 57;
const PORTRAIT_W = 965;
const PORTRAIT_H = 1190;

export async function composite(portraitBuffer: Buffer): Promise<Buffer> {
  const resized = await sharp(portraitBuffer)
    .resize(PORTRAIT_W, PORTRAIT_H, { fit: 'cover', position: 'centre' })
    .toBuffer();

  return sharp(TEMPLATE_PATH)
    .composite([{ input: resized, left: PORTRAIT_X, top: PORTRAIT_Y }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

// Dev helper: draws a red rectangle around the portrait area
export async function compositeWithGuide(portraitBuffer: Buffer): Promise<Buffer> {
  const resized = await sharp(portraitBuffer)
    .resize(PORTRAIT_W, PORTRAIT_H, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const guide = Buffer.from(
    `<svg width="${PORTRAIT_W}" height="${PORTRAIT_H}">
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
```

### 3.4 — Build `lib/mailer.ts`

```typescript
import nodemailer from 'nodemailer';
import { renderEmail } from './email-template';

const transporter = nodemailer.createTransport({
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
}) {
  return transporter.sendMail({
    from: `"${process.env.GMAIL_FROM_NAME}" <${process.env.GMAIL_USER}>`,
    to: opts.to,
    subject: 'your photo from euphoria',
    html: renderEmail({ name: opts.name, photoUrl: opts.photoUrl, previewUrl: opts.previewUrl }),
  });
}

export { transporter };
```

### 3.5 — Build `lib/email-template.ts` (stub for now)

Basic HTML stub with greeting, `<img src={previewUrl}>`, and `<a href={photoUrl}>view & download</a>`. Will be upgraded in Phase 4.

### 3.6 — Build `/api/deliver` (POST)

```
export const maxDuration = 30;
```

- Body: `{ code, portraitBase64 }`
- Timestamped `console.log` at each step
- Fetch guest by code via `supabaseAdmin`; 404 if missing
- Decode base64 to Buffer
- Call `composite(portraitBuffer)`
- Upload result to `photos` bucket at `{code}/final.jpg`, `contentType: 'image/jpeg'`, `upsert: true`
- Get public URL via `supabaseAdmin.storage`
- Render email via `renderEmail({ name, photoUrl: ${NEXT_PUBLIC_APP_URL}/p/${code}, previewUrl: public URL })`
- Send via `sendPhotoEmail()` wrapped in try/catch
- On mail success: update row `composited_path`, `sent_at = now()`, `status = 'sent'`. Return `{ ok: true }`.
- On mail failure: update `status = 'failed'`, keep `composited_path`. Return 500 with readable error.

### 3.7 — Build `/api/resend` (POST `?code=X`)

- Fetch guest; require `composited_path` (else 404)
- Build previewUrl from public storage URL
- Re-render and re-send email (no recomposite)
- Update `sent_at = now()`, `status = 'sent'` on success

### 3.8 — Build `/booth` page (client component, utilitarian)

**Section A — "Current guest":**
- File input 1: "Binding shot (photo with QR visible)"
- On selection: read as image, draw to hidden canvas downscaled to 1400px wide, run `jsqr` on canvas imageData, extract 6-char code
- If decoded: `GET /api/lookup?code=X`
  - Match: display "MATCHED: {name}" in large green + show email
  - Not found: red "Code {code} not in database"
  - No QR: red "No QR code detected — retake binding shot"
- File input 2: "Portrait to send"
- On portrait selection: draw to canvas downscaled to 2000px wide. If width > height, show yellow warning "This is landscape — will be heavily cropped. Use a vertical portrait?" with "Upload anyway" override. Store final portrait as base64 JPEG quality 0.9 in state.
- "Send to guest" button — disabled until valid code AND portrait both loaded
- On click: POST `{ code, portraitBase64 }` to `/api/deliver`. Show "Sending..." state. On 200: green "SENT to {email}" + "Next guest" button that resets all state. On error: red message with details, preserve state for retry.

**Section B — "Resend" (separated by a horizontal rule):**
- 6-char code input (auto-uppercase)
- "Resend" button → POST `/api/resend?code=X`
- Success/failure feedback inline

**Section C — "Recent sends" (at bottom):**
- On mount and every 20 seconds: GET `/api/recent`
- Simple table: time, code, name, email, status
- Status color-coded: `sent` = green, `failed` = red, others = gray

### 3.9 — Test composite script

Create `scripts/test-composite.ts`:

```typescript
import fs from 'fs';
import { composite } from '../lib/composite';

async function main() {
  const input = fs.readFileSync('./test-portrait.jpg');
  const output = await composite(input);
  fs.writeFileSync('./test-output.jpg', output);
  console.log('Wrote test-output.jpg');
}
main().catch(console.error);
```

Add to `package.json`:
```json
"scripts": {
  "test:composite": "tsx scripts/test-composite.ts"
}
```

### 3.10 — Verification

- Commit with message "booth and delivery"
- Push — Vercel auto-deploys
- Ask the user to drop a vertical photo at `./test-portrait.jpg` and run `npm run test:composite`
- Have the user open `./test-output.jpg` and confirm:
  - Portrait sits cleanly inside the Euphoria frame
  - No overlap with the white product area
  - No visible gap between portrait and product block
- If bad: adjust `PORTRAIT_H` in `lib/composite.ts` (±10–20px), re-run, iterate

Then full end-to-end test on live Vercel URL:
- Check in a guest on iPad (use user's own email)
- On laptop `/booth`: screenshot of iPad QR as binding shot → upload portrait → send
- Confirm email arrives in user's Gmail
- Test Resend with the same code

**Checkpoint 3:** User confirms composite placement is correct AND they received the email. Tell the user "Phase 3 complete. Ready for Phase 4?" Wait for confirmation.

---

## PHASE 4 — PHOTO VIEWER + PRODUCTION EMAIL

Goal: beautiful guest photo viewer page and Outlook-compatible branded email.

### 4.1 — Build `/p/[code]` page (server component, Next 15 App Router)

- Fetch guest by code via `supabaseAdmin`
- If no guest or no `composited_path`: centered message on black "your photo isn't ready yet — check back in a minute" in white lowercase
- If found:
  - Full-bleed black background (`#000`)
  - Centered composited image (from public storage URL), `max-height: 92vh`, `max-width: 92vw`, `object-fit: contain`
  - Below image, centered row, white text lowercase 14–16px, dot separators:
    - "download" — `<a>` with `download` attribute, links to public storage URL
    - "share to whatsapp" — `<a>` to `https://wa.me/?text=...` with encoded text `"my euphoria moment " + /p/[code] full URL`
    - "copy link" — button that calls `navigator.clipboard.writeText` with `/p/[code]` full URL, shows "copied" for 2 seconds
  - Footer: "calvin klein × euphoria" lowercase white/40, tiny
- Mobile-first — guests open on phones

### 4.2 — Replace `lib/email-template.ts` with production HTML

Requirements:
- `<!DOCTYPE html>` XHTML 1.0 Transitional
- MSO conditional comments for Outlook
- Table-based layout, `max-width: 600px`, centered
- All styles inline (no `<style>` blocks except MSO-specific)
- VML fallback button for Outlook 2007–2019
- No `background-image` on body
- Hidden preheader text: "your photo from the euphoria launch"

**Content order:**
1. Outer wrapper table: black background `#000`, full width
2. Inner content table: 600px, black
3. "euphoria" wordmark top, lowercase 14px letter-spacing 0.15em white, centered
4. 40px vertical spacer
5. "hi {name}," white 16px lowercase
6. "your moment from the euphoria launch." white 16px lowercase
7. 24px vertical spacer
8. Centered preview `<img src="{previewUrl}" width="560" style="display:block;width:100%;max-width:560px;height:auto;" alt="your photo">`
9. 24px vertical spacer
10. CTA button: background `#6B2BD9`, white lowercase "view & download", 16px font, 16px vertical padding, 40px horizontal. VML fallback. Link to photoUrl.
11. 40px vertical spacer
12. Footer: white/40 tiny "calvin klein × {NEXT_PUBLIC_EVENT_NAME}" centered

All URLs absolute (prepend `NEXT_PUBLIC_APP_URL` where needed).
Read `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_EVENT_NAME` via `process.env` inside `renderEmail`.

### 4.3 — Verification

- Commit with message "viewer and production email"
- Push — Vercel auto-deploys
- Full end-to-end test on live URL: new check-in → booth flow → verify email
- Ask user to open the email in Gmail web AND Gmail mobile app. Confirm:
  - Preview image loads
  - Violet CTA button renders correctly
  - Click opens `/p/[code]` on black background
  - Download works
  - Share to WhatsApp opens WhatsApp with pre-filled text
  - Copy link works

**Checkpoint 4:** User confirms email + viewer are on-brand. Tell the user "Phase 4 complete. Ready for Phase 5?" Wait for confirmation.

---

## PHASE 5 — HARDENING (ADMIN, OPS, HEALTH)

Goal: monitoring, emergency recovery, and safety rails for the 3-day event.

### 5.1 — Build `/admin` page

Server component that fetches all guests on render, plus a client wrapper that re-fetches every 30 seconds.

- Top: row with counts "Checked in: N | Shot: N | Sent: N | Failed: N"
- Table: columns `code, name, email, status, sent_at, created_at`, ordered by `created_at desc`
- Plain utilitarian styling (Tailwind defaults fine)

### 5.2 — Build `/api/health` (GET)

- `SELECT 1` via Supabase to verify DB
- `transporter.verify()` on Gmail to verify SMTP
- Return `{ ok: true, db: 'ok', smtp: 'ok' }` on success
- Return `{ ok: false, db: '...', smtp: '...' }` with error details on failure

### 5.3 — Audit `/api/deliver` and `/api/resend`

- Try/catch around every major step (fetch, composite, upload, render, send, DB update)
- Timestamped `console.log` at each step
- Always resolve status to `'sent'` or `'failed'`, never leave ambiguous
- Readable error messages in responses (no raw stack traces)

### 5.4 — Create `public/robots.txt`

```
User-agent: *
Disallow: /
```

### 5.5 — Build `/ops` page (password-protected)

- On mount, show password input
- POST password to `/api/ops-auth` which compares against `process.env.OPS_PASSWORD`
- On success, set authenticated state (useState, session-only)
- When authenticated, show two buttons:
  - **"Resend last failed"** → POST `/api/ops/resend-last-failed` with password in body. Server verifies, finds most recent `status='failed'` guest, re-sends email.
  - **"Export CSV"** → GET `/api/ops/export-csv?password=X`. Server verifies, returns CSV of all guest rows with proper `Content-Type: text/csv` and `Content-Disposition: attachment; filename=guests.csv`
- Plain functional styling

### 5.6 — Verification

- Commit with message "hardening"
- Push
- Verify on live URL:
  - `/api/health` returns `{ ok: true, db: 'ok', smtp: 'ok' }`
  - `/admin` shows counts and guest list
  - `/ops` password prompt works; entering `euphoria2026` unlocks it
  - "Export CSV" downloads a valid CSV
  - `/robots.txt` shows the disallow
- If `smtp: error` in health check, Gmail app password is wrong — tell the user to regenerate and update both `.env.local` and Vercel env vars

**Checkpoint 5:** All verification passes. Tell the user "Phase 5 complete. Ready for Phase 6 (final handoff)?" Wait for confirmation.

---

## PHASE 6 — HANDOFF DOCUMENT

Goal: produce the operator guide for the Amsterdam team.

### 6.1 — Generate `HANDOFF.md`

Create `HANDOFF.md` in the project root with the following content, substituting actual URL:

```markdown
# EVENT PHOTO APP — OPERATOR GUIDE
## Calvin Klein × Euphoria Launch

### URLS
- iPad check-in: https://<URL>/checkin
- Photographer booth: https://<URL>/booth
- Admin dashboard: https://<URL>/admin
- Ops panel (password: euphoria2026): https://<URL>/ops
- Health check: https://<URL>/api/health

### BEFORE EVENT (30 min before doors)
- Hit /api/health. Both db and smtp must say "ok". If either says "error", call Adriaan.
- Open /checkin on the iPad, confirm full-screen display.
- Open /booth on the laptop.
- One full dummy run with fake name + real email you control. Confirm email arrives within 2 minutes.

### FLOW PER GUEST
1. Guest at iPad types name + email, taps continue
2. iPad shows QR and 6-char code
3. Guest walks iPad to the booth
4. Photographer takes ONE binding shot: guest holding iPad with QR visible. Loose framing fine.
5. Photographer takes portrait shots — VERTICAL ONLY, ideally 4:5 crop. Landscape gets cropped.
6. On laptop at /booth:
   a. Upload binding shot → wait for green "MATCHED: {name}"
   b. Upload best portrait. Yellow warning = pick a different vertical shot.
   c. Click "Send to guest"
   d. Wait for green "SENT to {email}"
   e. Click "Next guest" to reset
7. Guest gets email within ~1 minute

### SHOT FORMAT
VERTICAL only, 4:5 crop ideal. Headroom above head, include some body. System center-crops to fit template. Avoid phone-style 9:16 vertical (crops too aggressively).

### TROUBLESHOOTING

**Email didn't arrive after 3 minutes:**
- Tell guest check spam
- On /booth scroll to "Resend", type 6-char code, click Resend
- Still nothing: check /admin for status. If "failed", /ops → "Resend last failed"

**QR won't scan:**
- Better lighting
- Guest holds iPad closer/steadier
- Retake binding shot

**"Code not in database":**
- Guest skipped check-in. Send back to iPad.

**Major issue:**
- Check /admin for statuses
- Check /api/health
- Use /ops → "Export CSV" to backup data
- Call Adriaan: [PHONE]

### LIMITS
- Gmail: 500 sends/day (personal) or 2000/day (Workspace). Fine.
- Capacity: 400 guests across 3 days.

### EMERGENCY (app fully down)
- Use /ops → "Export CSV" while still accessible
- Otherwise: paper list of every guest's name + email. Batch send manually after.
```

Commit with message "handoff doc", push.

### 6.2 — Final verification table

Print this table for the user:

```
✓ GitHub repo: https://github.com/<user>/event-photo
✓ Vercel URL: https://<production-url>
✓ /checkin — iPad-facing, Euphoria styled
✓ /booth — photographer workflow
✓ /p/[code] — guest photo viewer
✓ /admin — guest list + counts
✓ /ops — password-gated emergency panel (password: euphoria2026)
✓ /api/health — returns ok
✓ Gmail sending verified
✓ Composite placement verified
✓ Email rendering verified
✓ HANDOFF.md — operator guide

READY FOR AMSTERDAM.
```

Tell the user "Build complete. All phases verified. HANDOFF.md is ready to share with your Amsterdam colleagues."

---

## REFERENCE: TEMPLATE COMPOSITE COORDINATES

```
Template: 1080 × 1920
Photo window:
  PORTRAIT_X = 57
  PORTRAIT_Y = 57
  PORTRAIT_W = 965
  PORTRAIT_H = 1190
Bottom 690px: fixed CK Euphoria branding — do not touch
```

## REFERENCE: ENVIRONMENT VARIABLES

| Var | Source | Example |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | `eyJ...` |
| `GMAIL_USER` | User's Gmail | `user@gmail.com` |
| `GMAIL_APP_PASSWORD` | Google App Passwords | 16 chars |
| `GMAIL_FROM_NAME` | Fixed | `Calvin Klein Euphoria` |
| `NEXT_PUBLIC_APP_URL` | Vercel deploy | `https://event-photo-xxx.vercel.app` |
| `NEXT_PUBLIC_EVENT_NAME` | Fixed | `Euphoria Launch` |
| `OPS_PASSWORD` | Fixed | `euphoria2026` |

## REFERENCE: BRAND

- Background: `#000000`
- Accent (violet): `#6B2BD9`
- Typography: Inter (via `next/font`), lowercase, letter-spaced
- Email subject: `your photo from euphoria`

## REFERENCE: ROUTE MAP

| Route | Purpose | Audience |
|---|---|---|
| `/checkin` | Guest check-in | Guests (iPad) |
| `/booth` | Photographer workflow | Staff (laptop) |
| `/p/[code]` | Photo viewer | Guests (phone) |
| `/admin` | Guest list + counts | Staff |
| `/ops` | Emergency panel | Staff (password) |
| `/api/checkin` | Create guest | Internal |
| `/api/lookup` | Code → guest | Internal |
| `/api/deliver` | Main pipeline | Internal |
| `/api/resend` | Re-send email | Internal |
| `/api/recent` | Last 10 guests | Internal |
| `/api/health` | Infra check | Monitoring |
| `/api/ops-auth` | Password check | Internal |
| `/api/ops/resend-last-failed` | Emergency resend | Internal |
| `/api/ops/export-csv` | Data export | Internal |

---

## IF THINGS GO WRONG

**Error messages:** Paste verbatim. Don't paraphrase.

**Vercel build fails:** Fetch logs with `vercel logs <deployment-url>`. Identify the specific error, propose a fix.

**Works locally, broken on Vercel:** 90% of the time it's env vars. Verify every var with `vercel env ls production`, compare to `.env.local`.

**Composite placement off:** Use `compositeWithGuide()` exported from `lib/composite.ts` via a temporary API route or test script. Adjust `PORTRAIT_X/Y/W/H` 10–20px at a time.

**Claude Code context confused:** Ask the user to `/exit` and restart. Re-read this document, identify which phase is incomplete, resume from there.

---

## START

Begin at Phase 0, Step 0.1. Work through in order. Verify at every checkpoint. Commit and push after every phase. Ask the user only when you truly need something they must provide (browser auth, Gmail app password, confirmation that visual output is correct).

Good luck.
