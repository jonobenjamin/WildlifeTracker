const express = require('express');
const router = express.Router();

// Same shared key gate as the other read-only map endpoints (observations, trees, fires).
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ success: false, message: 'Valid API key required' });
  }
  next();
};
router.use(validateApiKey);

function partnerConfig() {
  return {
    base: process.env.OKAVANGO_API_BASE || 'https://okavangowater.com',
    slug: process.env.OKAVANGO_PARTNER_SLUG || '',
    key: process.env.OKAVANGO_API_KEY || '',
  };
}

function notConfigured(res) {
  return res.status(503).json({
    success: false,
    message: 'Okavango Water partner integration not configured (missing OKAVANGO_API_KEY / OKAVANGO_PARTNER_SLUG)',
  });
}

// GET /api/okavango-water/catalog[?date=YYYYMMDD] — metadata + published date list
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
        message: data.message || `Okavango Water catalog request failed (${upstream.status})`,
      });
    }

    res.json({ success: true, ...data });
  } catch (error) {
    console.error('Error fetching Okavango Water catalog:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch Okavango Water catalog' });
  }
});

// GET /api/okavango-water/image?date=YYYYMMDD — proxies the PNG water-extent overlay
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
        message: `Okavango Water image request failed (${upstream.status})`,
        details: text.slice(0, 300),
      });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    const waterDate = upstream.headers.get('x-water-date');
    if (waterDate) res.setHeader('X-Water-Date', waterDate);
    res.status(200).send(buffer);
  } catch (error) {
    console.error('Error fetching Okavango Water image:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch Okavango Water image' });
  }
});

module.exports = router;
