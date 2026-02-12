/**
 * Cron endpoint for scheduled fire checks.
 * Called by Vercel Cron on a schedule - sends email notifications when fires are detected.
 * Protected by CRON_SECRET (set in Vercel env vars).
 */

const express = require('express');
const router = express.Router();
const { fetchFiresAndSendNotifications } = require('../services/fireCheckService');

router.get('/', async (req, res) => {
  // Verify CRON_SECRET - Vercel sends Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || token !== cronSecret) {
    console.warn('[CronFireCheck] Unauthorized - missing or invalid CRON_SECRET');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[CronFireCheck] Running scheduled fire check...');
    const { features, notificationResults } = await fetchFiresAndSendNotifications(3);

    res.status(200).json({
      success: true,
      firesFound: features.length,
      notificationsSent: notificationResults.email?.success ?? false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[CronFireCheck] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
