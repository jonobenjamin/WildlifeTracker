const express = require('express');
const router = express.Router();
const { sendFireNotifications } = require('../services/notificationServices');
const { getConcessionFirmsBbox, filterFiresInConcession } = require('../services/concessionBoundary');

// Daily fire check - invoked by Vercel cron at 4:00 UTC.
// Emails ONLY for fires inside the KPR concession boundary polygon.
router.get('/', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || token !== cronSecret) {
    console.warn('[CronFireCheck] Unauthorized - ensure CRON_SECRET is set in Vercel');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[CronFireCheck] Running scheduled fire check (concession-only alerts)...');

    const mapKey = (process.env.FIRMS_MAP_KEY || '').trim().replace(/^["']|["']$/g, '');
    if (!mapKey) throw new Error('FIRMS_MAP_KEY not configured');

    const bbox = getConcessionFirmsBbox();
    const days = 3;
    const BASE_URL = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
    const products = [
      ['VIIRS_SNPP_NRT', 'VIIRS'],
      ['VIIRS_NOAA20_NRT', 'VIIRS'],
      ['MODIS_NRT', 'MODIS'],
    ];

    const features = [];
    for (const [product, sensor] of products) {
      try {
        const url = `${BASE_URL}/${mapKey}/${product}/${bbox}/${days}`;
        const upstream = await fetch(url);
        if (!upstream.ok) {
          console.error(`[CronFireCheck] ${product} failed: ${upstream.status}`);
          continue;
        }
        const text = await upstream.text();
        features.push(...parseCSV(text, sensor));
      } catch (err) {
        console.error(`[CronFireCheck] ${product} error:`, err.message);
      }
    }

    const inConcession = filterFiresInConcession(features);
    console.log(`[CronFireCheck] fetched=${features.length} inConcession=${inConcession.length}`);

    let notificationResults = null;
    if (inConcession.length > 0) {
      notificationResults = await sendFireNotifications(inConcession);
    } else {
      console.log('[CronFireCheck] No fires inside concession — skipping email alerts');
    }

    res.status(200).json({
      success: true,
      firesFetched: features.length,
      firesInConcession: inConcession.length,
      notificationsSent: notificationResults?.email?.success ?? false,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CronFireCheck] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

function parseCSV(csvText, sensor) {
  const text = String(csvText || '').trim();
  if (!text || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) return [];
  if (/invalid|denied|unauthorized|error/i.test(text) && !text.includes('latitude')) return [];

  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const features = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < headers.length) continue;

    const properties = {};
    headers.forEach((header, index) => {
      properties[header] = (values[index] || '').trim();
    });

    const lat = parseFloat(properties.latitude);
    const lng = parseFloat(properties.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { ...properties, sensor },
    });
  }

  return features;
}

module.exports = router;
