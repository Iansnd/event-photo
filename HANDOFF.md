# EVENT PHOTO APP — OPERATOR GUIDE
## Calvin Klein × Euphoria Launch

### URLS
- iPad check-in: https://event-photo-six.vercel.app/checkin
- Photographer booth: https://event-photo-six.vercel.app/booth
- Admin dashboard: https://event-photo-six.vercel.app/admin
- Ops panel (password: `euphoria2026`): https://event-photo-six.vercel.app/ops
- Health check: https://event-photo-six.vercel.app/api/health
- Guest photo viewer: https://event-photo-six.vercel.app/p/{CODE}

### BEFORE EVENT (30 min before doors)
- Hit `/api/health`. Both `db` and `smtp` must say `"ok"`. If either says `"error"`, call Adriaan.
- Open `/checkin` on the iPad, confirm full-screen display (add to home screen for kiosk mode).
- Open `/booth` on the laptop.
- One full dummy run with fake name + real email you control. Confirm email arrives within 2 minutes.

### FLOW PER GUEST
1. Guest at iPad types name + email, taps **continue**.
2. iPad shows QR and 6-char code.
3. Guest walks iPad to the booth.
4. Photographer takes ONE binding shot: guest holding iPad with QR visible. Loose framing fine.
5. Photographer takes portrait shots — **VERTICAL ONLY**, ideally 4:5 crop. Landscape gets cropped.
6. On laptop at `/booth`:
   a. Upload binding shot → wait for green **MATCHED: {name}**.
   b. Upload best portrait. Yellow warning = pick a different vertical shot (or override with *upload anyway*).
   c. Click **send to guest**.
   d. Wait for green **SENT to {email}**.
   e. Click **next guest** to reset.
7. Guest gets email within ~1 minute.

### SHOT FORMAT
VERTICAL only, 4:5 crop ideal. Headroom above head, include some body. System center-crops to fit the template (965 × 1190 px). Avoid phone-style 9:16 vertical (crops too aggressively).

### TROUBLESHOOTING

**Email didn't arrive after 3 minutes:**
- Tell guest to check spam.
- On `/booth` scroll to **Resend**, type the 6-char code, click **Resend**.
- Still nothing: check `/admin` for status. If `failed`, go to `/ops` → **Resend last failed**.

**QR won't scan:**
- Better lighting.
- Guest holds iPad closer/steadier.
- Retake binding shot.

**"Code not in database":**
- Guest skipped check-in. Send back to iPad.

**Portrait shows as landscape warning:**
- Ask photographer to shoot vertical. If time pressure, *upload anyway* — it'll center-crop.

**Major issue:**
- Check `/admin` for statuses.
- Check `/api/health`.
- Use `/ops` → **Export CSV** to backup data.
- Call Adriaan: [PHONE]

### LIMITS
- Gmail: 500 sends/day (personal) or 2000/day (Workspace). Fine for ~400 guests × 3 days.
- Capacity: designed for 400 guests across 3 days.

### EMERGENCY (app fully down)
- Use `/ops` → **Export CSV** while still accessible.
- Otherwise: paper list of every guest's name + email. Batch send manually afterward.

### WHAT EACH PAGE IS FOR

| Page | Who opens it | When |
|---|---|---|
| `/checkin` | Guest | At the iPad |
| `/booth` | Photographer | Whole event, keep open |
| `/p/{code}` | Guest | From the email link |
| `/admin` | Staff | Monitoring mid-event |
| `/ops` | Staff | Emergency only (password) |
| `/api/health` | Anyone | Before event + if something feels wrong |

### STATUSES
- `checked_in` — guest filled in iPad, not shot yet
- `shot` — portrait uploaded, mail attempted
- `sent` — email delivered
- `failed` — mail send failed (use `/ops` → resend last failed)

### BRAND NOTES
- Guest-facing screens (check-in, photo viewer, email): pure black, violet accent `#6B2BD9`, lowercase Inter.
- Booth/admin/ops: utilitarian dark. Function over form.
- Template photo window: 965 × 1190 inset 57 px from top and sides. Bottom 690 px is fixed CK Euphoria branding.
