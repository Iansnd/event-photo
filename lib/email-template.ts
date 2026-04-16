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

/**
 * Production email template.
 *
 * Goals:
 * - XHTML 1.0 Transitional DOCTYPE
 * - Table-based layout, max-width 600px, centered
 * - All styles inline (no <style> blocks outside of MSO-specific)
 * - VML fallback button for Outlook 2007–2019
 * - MSO conditional comments where needed
 * - Hidden preheader text
 * - No background-image on body
 * - Dark black background with a single violet accent for the CTA
 */
export function renderEmail(opts: RenderEmailOpts): string {
  const firstName = (opts.name.trim().split(/\s+/)[0] || opts.name).toLowerCase();
  const photoUrl = opts.photoUrl;
  const previewUrl = opts.previewUrl;
  const eventName = process.env.NEXT_PUBLIC_EVENT_NAME ?? 'Euphoria Launch';

  const ePhotoUrl = escapeHtml(photoUrl);
  const ePreviewUrl = escapeHtml(previewUrl);
  const eFirst = escapeHtml(firstName);
  const eEvent = escapeHtml(eventName);
  const preheader = `your photo from the ${eventName.toLowerCase()}`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>your photo from euphoria</title>
<!--[if mso]>
<style type="text/css">
  table, td, div, p, a { font-family: Arial, sans-serif !important; }
</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#000000;color:#ffffff;">
<!-- hidden preheader -->
<div style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;overflow:hidden;mso-hide:all;">
${escapeHtml(preheader)}
</div>

<!-- outer wrapper -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#000000;" bgcolor="#000000">
  <tr>
    <td align="center" style="padding:0;">
      <!--[if mso]>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center" style="width:600px;"><tr><td>
      <![endif]-->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:#000000;" bgcolor="#000000">
        <tr>
          <td align="center" style="padding:40px 24px 0 24px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;letter-spacing:0.15em;color:#ffffff;text-transform:lowercase;">euphoria</p>
          </td>
        </tr>
        <tr><td style="font-size:0;line-height:0;height:40px;">&nbsp;</td></tr>
        <tr>
          <td align="left" style="padding:0 24px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#ffffff;text-transform:lowercase;line-height:1.4;">hi ${eFirst},</p>
            <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#ffffff;text-transform:lowercase;line-height:1.4;">your moment from the ${eEvent.toLowerCase()}.</p>
          </td>
        </tr>
        <tr><td style="font-size:0;line-height:0;height:24px;">&nbsp;</td></tr>
        <tr>
          <td align="center" style="padding:0 24px;">
            <img src="${ePreviewUrl}" width="560" alt="your photo" style="display:block;width:100%;max-width:560px;height:auto;border:0;outline:none;text-decoration:none;" />
          </td>
        </tr>
        <tr><td style="font-size:0;line-height:0;height:24px;">&nbsp;</td></tr>
        <tr>
          <td align="center" style="padding:0 24px;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${ePhotoUrl}" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="0%" stroke="f" fillcolor="#6B2BD9">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;">view &amp; download</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-- -->
            <a href="${ePhotoUrl}" style="display:inline-block;background-color:#6B2BD9;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:16px;text-transform:lowercase;padding:16px 40px;mso-padding-alt:0;border:0;">view &amp; download</a>
            <!--<![endif]-->
          </td>
        </tr>
        <tr><td style="font-size:0;line-height:0;height:40px;">&nbsp;</td></tr>
        <tr>
          <td align="center" style="padding:0 24px 40px 24px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.4);text-transform:lowercase;letter-spacing:0.1em;">calvin klein × ${eEvent.toLowerCase()}</p>
          </td>
        </tr>
      </table>
      <!--[if mso]>
      </td></tr></table>
      <![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}
