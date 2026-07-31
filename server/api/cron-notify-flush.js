const express = require('express');
const { getDb } = require('../firestoreDb');
const { sendObservationNotification } = require('../services/notificationServices');

const router = express.Router();

/**
 * Cron: re-send alerts for recent observations that never got a successful notification.
 * Secured with CRON_SECRET (Vercel Cron) or x-api-key.
 */
router.get('/', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const cronSecret = process.env.CRON_SECRET;
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const authorized =
    (cronSecret && token === cronSecret) ||
    (process.env.API_KEY && apiKey === process.env.API_KEY);

  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const rulesSnap = await db.collection('notificationRules').get();
    if (rulesSnap.empty) {
      return res.json({ success: true, message: 'No notification rules configured', sent: 0 });
    }

    let snap;
    try {
      snap = await db.collection('observations').orderBy('timestamp', 'desc').limit(40).get();
    } catch {
      snap = await db.collection('observations').limit(40).get();
    }

    const cutoff = Date.now() - 72 * 3600 * 1000;
    let sent = 0;
    let failed = 0;
    const details = [];

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (data.notification?.success === true) continue;
      const ts = Date.parse(data.timestamp || '') || 0;
      if (ts && ts < cutoff) continue;
      const cat = String(data.category || '').toLowerCase();
      if (!['sighting', 'incident', 'maintenance'].includes(cat)) continue;

      const notification = await sendObservationNotification({ id: doc.id, ...data });
      await doc.ref.set(
        { notification, notificationAt: new Date().toISOString() },
        { merge: true }
      );
      if (notification?.success) sent += 1;
      else failed += 1;
      details.push({ id: doc.id, animal: data.animal, result: notification });
    }

    return res.json({ success: true, sent, failed, details });
  } catch (error) {
    console.error('[notify-flush]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
