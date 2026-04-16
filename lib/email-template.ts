type RenderEmailOpts = {
  name: string;
  photoUrl: string; // /p/[code] viewer URL
  previewUrl: string; // direct public image URL
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Phase 3 stub. Replaced with Outlook-safe version in Phase 4.
export function renderEmail(opts: RenderEmailOpts): string {
  const firstName = opts.name.trim().split(/\s+/)[0] || opts.name;
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <p style="font-size:14px;letter-spacing:0.15em;">euphoria</p>
    <p style="font-size:16px;margin-top:32px;">hi ${escapeHtml(firstName.toLowerCase())},</p>
    <p style="font-size:16px;">your moment from the euphoria launch.</p>
    <p style="margin:24px 0;"><img src="${escapeHtml(opts.previewUrl)}" alt="your photo" style="display:block;width:100%;max-width:560px;height:auto;"/></p>
    <p><a href="${escapeHtml(opts.photoUrl)}" style="display:inline-block;padding:16px 40px;background:#6B2BD9;color:#fff;text-decoration:none;">view &amp; download</a></p>
    <p style="color:rgba(255,255,255,0.4);font-size:12px;margin-top:40px;">calvin klein × ${escapeHtml(process.env.NEXT_PUBLIC_EVENT_NAME ?? 'Euphoria Launch')}</p>
  </div>
</body></html>`;
}
