const express = require('express');
const { createFieldAuth } = require('../middleware/fieldAuth');
const { getDb } = require('../firestoreDb');

const router = express.Router();

router.use(createFieldAuth(getDb()));

function partnerConfig() {
  return {
    base: process.env.OKAVANGO_API_BASE || 'https://www.okavangowater.com',
    slug: process.env.OKAVANGO_NDVI_PARTNER_SLUG || 'kpr-ndvi',
    key: process.env.OKAVANGO_NDVI_API_KEY || process.env.OKAVANGO_API_KEY || '',
  };
}

function notConfigured(res) {
  return res.status(503).json({
    success: false,
    message:
      'Okavango NDVI partner integration not configured (missing OKAVANGO_NDVI_API_KEY or OKAVANGO_API_KEY)',
  });
}

// GET /api/okavango-ndvi/catalog[?date=YYYYMMDD] — metadata + published date list
router.get('/catalog', async (req, res) => {
  try {
    const { base, slug, key } = partnerConfig();
    if (!slug || !key) return notConfigured(res);

    const url = new URL(`${base}/api/partners/${slug}`);
    if (req.query.date) url.searchParams.set('date', req.query.date);

    const upstream = await fetch(url.toString(), { headers: { 'X-API-Key': key } });
    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        success: false,
        message: data.message || `Okavango NDVI catalog request failed (${upstream.status})`,
      });
    }

    res.json({ success: true, ...data });
  } catch (error) {
    console.error('Error fetching Okavango NDVI catalog:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch Okavango NDVI catalog' });
  }
});

// GET /api/okavango-ndvi/image?date=YYYYMMDD — proxies the PNG NDVI overlay
router.get('/image', async (req, res) => {
  try {
    const { base, slug, key } = partnerConfig();
    if (!slug || !key) return notConfigured(res);

    const date = req.query.date;
    if (!date) return res.status(400).json({ success: false, message: 'date query param is required' });

    const url = `${base}/api/partners/${slug}/image?date=${encodeURIComponent(date)}`;
    const upstream = await fetch(url, { headers: { 'X-API-Key': key } });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({
        success: false,
        message: `Okavango NDVI image request failed (${upstream.status})`,
        details: text.slice(0, 300),
      });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    const ndviDate = upstream.headers.get('x-ndvi-date') || upstream.headers.get('x-water-date');
    if (ndviDate) res.setHeader('X-Ndvi-Date', ndviDate);
    res.status(200).send(buffer);
  } catch (error) {
    console.error('Error fetching Okavango NDVI image:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch Okavango NDVI image' });
  }
});

module.exports = router;
