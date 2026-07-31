/**
 * Shared Resend sender for Express (CJS) routes.
 * Uses Resend HTTP API (same path as Admin "Send test") — more reliable on Vercel
 * than the Resend Node SDK inside the Express bridge.
 * Env: RESEND_API_KEY, RESEND_FROM_EMAIL, EMAIL_FROM_NAME (optional)
 */

function apiKey() {
  return (process.env.RESEND_API_KEY || '').trim();
}

function fromAddress() {
  const email = (process.env.RESEND_FROM_EMAIL || '').trim();
  // Catch common Vercel misconfig where the value was set to the variable NAME
  if (!email || !email.includes('@') || email === 'RESEND_FROM_EMAIL') return null;
  const name = (process.env.EMAIL_FROM_NAME || 'KPR Wildlife Tracker').trim();
  return name ? `${name} <${email}>` : email;
}

function isConfigured() {
  return !!(apiKey() && fromAddress());
}

/**
 * @param {{ to: string|string[], subject: string, html: string, text?: string }} opts
 */
async function sendResendEmail({ to, subject, html, text }) {
  const key = apiKey();
  const from = fromAddress();
  if (!key || !from) {
    return { success: false, reason: 'Resend not configured (RESEND_API_KEY / RESEND_FROM_EMAIL)' };
  }

  const recipients = (Array.isArray(to) ? to : [to])
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean);

  if (recipients.length === 0) {
    return { success: false, reason: 'No recipients' };
  }

  const results = [];
  for (const recipient of recipients) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [recipient],
          subject,
          html,
          text: text || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = body?.message || body?.error || `Resend HTTP ${res.status}`;
        console.error(`Resend failed for ${recipient}:`, errMsg);
        results.push({ success: false, recipient, error: String(errMsg) });
      } else {
        results.push({ success: true, recipient, messageId: body?.id });
        console.log(`Resend email sent to ${recipient}:`, body?.id);
      }
    } catch (err) {
      console.error(`Resend exception for ${recipient}:`, err);
      results.push({ success: false, recipient, error: err.message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  return {
    success: successCount > 0,
    results,
    message: `Sent to ${successCount}/${recipients.length} recipients`,
  };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildAlertHtml({
  heading,
  subtitle,
  intro,
  rows,
  mapsLink,
  footer,
  accent = '#b42318',
}) {
  const detailRows = (rows || [])
    .map(
      ([label, value]) => `
      <div style="margin:12px 0;padding:14px;background:#fff;border-radius:8px;border-left:4px solid #526b38;">
        <strong style="color:#43512d;">${escapeHtml(label)}:</strong>
        <span style="color:#333;"> ${escapeHtml(value)}</span>
      </div>`
    )
    .join('');

  const mapBlock = mapsLink
    ? `<p style="margin:20px 0;"><a href="${escapeHtml(mapsLink)}" style="display:inline-block;background:#526b38;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">View on Google Maps</a></p>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:Segoe UI,Tahoma,sans-serif;color:#333;">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08);">
    <div style="background:${accent};color:#fff;padding:24px;text-align:center;">
      <h1 style="margin:0;font-size:22px;">${escapeHtml(heading)}</h1>
      <p style="margin:8px 0 0;opacity:.9;font-size:14px;">${escapeHtml(subtitle || '')}</p>
    </div>
    <div style="padding:28px;background:#faf8f4;">
      <p style="margin:0 0 16px;font-weight:600;color:#5c4033;">${escapeHtml(intro || '')}</p>
      ${detailRows}
      ${mapBlock}
      <p style="margin:24px 0 0;font-size:13px;color:#666;">${escapeHtml(footer || '')}</p>
    </div>
  </div>
</body></html>`;
}

module.exports = {
  isConfigured,
  sendResendEmail,
  buildAlertHtml,
  escapeHtml,
};
