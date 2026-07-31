const express = require('express');
const { isConfigured, sendResendEmail, buildAlertHtml } = require('../services/resendEmail');
const { getRecipientEmailsForEvent, COLLECTION } = require('../services/notificationRules');
const { getDb } = require('../firestoreDb');

const router = express.Router();

function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Valid API key required' });
  }
  next();
}

/**
 * GET /api/notifications/status
 * Safe diagnostics: is Resend configured, how many rules, would a sample event match?
 * Optional: ?sendTest=1&email=you@example.com to actually send a Resend test (uses API key).
 */
router.get('/status', validateApiKey, async (req, res) => {
  try {
    const db = getDb();
    let rulesCount = 0;
    let rulesSample = [];
    if (db) {
      const snap = await db.collection(COLLECTION).get();
      rulesCount = snap.size;
      rulesSample = snap.docs.slice(0, 10).map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          category: data.category,
          items: data.items,
          userIds: data.userIds,
          enabled: data.enabled !== false,
        };
      });
    }

    const sampleCategory = String(req.query.category || 'sighting').toLowerCase();
    const sampleItem = String(req.query.item || 'Lion');
    const matchedEmails = await getRecipientEmailsForEvent({
      category: sampleCategory,
      item: sampleItem,
    });

    const fromEmail = (process.env.RESEND_FROM_EMAIL || '').trim();
    const payload = {
      success: true,
      resend: {
        configured: isConfigured(),
        hasApiKey: !!(process.env.RESEND_API_KEY || '').trim(),
        hasFromEmail: !!fromEmail,
        fromEmail: fromEmail || null,
        fromName: (process.env.EMAIL_FROM_NAME || 'KPR Wildlife Tracker').trim(),
      },
      firestore: { databaseReady: !!db, rulesCount },
      rulesSample,
      sampleMatch: {
        category: sampleCategory,
        item: sampleItem,
        recipientCount: matchedEmails.length,
        // partially redact emails
        recipients: matchedEmails.map((e) => {
          const [u, domain] = e.split('@');
          return `${(u || '').slice(0, 2)}***@${domain || '?'}`;
        }),
      },
      hint: !isConfigured()
        ? 'Set RESEND_API_KEY and RESEND_FROM_EMAIL=alerts@okavangowater.com on Vercel project khwai-private-reserve, then redeploy.'
        : matchedEmails.length === 0
          ? 'Resend is configured but no Admin notification rules matched this sample. Open Admin → Configure Notifications and add a Sightings rule (All or matching species) for a user with an email.'
          : 'Resend + rules look OK. If field app still fails, hard-refresh / Update app so it posts to khwaiprivate.okavangowater.com.',
    };

    if (String(req.query.sendTest) === '1') {
      const to = String(req.query.email || matchedEmails[0] || '').trim().toLowerCase();
      if (!to) {
        return res.status(400).json({ ...payload, test: { success: false, reason: 'No email for test' } });
      }
      if (!isConfigured()) {
        return res.status(503).json({ ...payload, test: { success: false, reason: 'Resend not configured' } });
      }
      const html = buildAlertHtml({
        heading: 'TEST NOTIFICATION',
        subtitle: 'KPR Wildlife Tracker',
        intro: 'This is a diagnostic test from /api/notifications/status.',
        accent: '#526b38',
        footer: 'If you received this, Resend works on khwai-private-reserve.',
        rows: [
          ['To', to],
          ['From', fromEmail],
          ['Time', new Date().toISOString()],
        ],
      });
      const test = await sendResendEmail({
        to,
        subject: 'KPR Wildlife Tracker — diagnostic test',
        html,
        text: 'Resend diagnostic test from KPR Wildlife Tracker.',
      });
      return res.json({ ...payload, test });
    }

    return res.json(payload);
  } catch (error) {
    console.error('notifications/status failed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
