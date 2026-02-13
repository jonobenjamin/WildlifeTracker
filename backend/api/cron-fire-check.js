const express = require('express');
const router = express.Router();
const { sendFireNotifications } = require('../services/notificationServices');

router.get('/', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || token !== cronSecret) {
    console.warn('[CronFireCheck] Unauthorized');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[CronFireCheck] Running scheduled fire check...');

    const BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
    const bbox = '-125,24,-66,49';
    const days = 3;

    if (!process.env.FIRMS_MAP_KEY) {
      throw new Error('FIRMS_MAP_KEY not configured');
    }

    const mapKey = process.env.FIRMS_MAP_KEY;

    const viirsUrl = `${BASE_URL}/${mapKey}/VIIRS_SNPP_NRT/${bbox}/${days}`;
    const modisUrl = `${BASE_URL}/${mapKey}/MODIS_NRT/${bbox}/${days}`;

    const viirsRes = await fetch(viirsUrl);
    const modisRes = await fetch(modisUrl);

    if (!viirsRes.ok || !modisRes.ok) {
      throw new Error('Failed to fetch fire data from FIRMS');
    }

    const viirsText = await viirsRes.text();
    const modisText = await modisRes.text();

    const features = [
      ...parseCSV(viirsText, "VIIRS"),
      ...parseCSV(modisText, "MODIS")
    ];

    const notificationResults = await sendFireNotifications(features);

    res.status(200).json({
      success: true,
      firesFound: features.length,
      notificationsSent: notificationResults?.email?.success ?? false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[CronFireCheck] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

function parseCSV(csvText, sensor) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',');
  const features = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length !== headers.length) continue;

    const properties = {};
    headers.forEach((header, index) => {
      properties[header.trim()] = values[index].trim();
    });

    const lat = parseFloat(properties.latitude);
    const lng = parseFloat(properties.longitude);

    if (!isNaN(lat) && !isNaN(lng)) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        properties: {
          ...properties,
          sensor
        }
      });
    }
  }

  return features;
}

module.exports = router;
