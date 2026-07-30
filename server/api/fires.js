const express = require('express');
const router = express.Router();
const { getConcessionFirmsBbox, filterFiresInConcession } = require('../services/concessionBoundary');

module.exports = (db) => {
  const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid API key required',
      });
    }
    next();
  };

  router.use(validateApiKey);

  function csvToGeoJSON(csvText, sensorFallback) {
    const text = String(csvText || '').trim();
    if (!text || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      throw new Error('FIRMS returned HTML instead of CSV — check FIRMS_MAP_KEY');
    }
    if (/invalid|denied|unauthorized|error/i.test(text) && !text.includes('latitude')) {
      throw new Error(text.slice(0, 200));
    }

    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return { type: 'FeatureCollection', features: [] };

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
        properties: {
          ...properties,
          sensor: sensorFallback || properties.instrument || 'Unknown',
        },
      });
    }

    return { type: 'FeatureCollection', features };
  }

  async function fetchFirmsProduct(mapKey, product, bbox, days) {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${product}/${bbox}/${days}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`${product} HTTP ${res.status}: ${text.slice(0, 160)}`);
      }
      return csvToGeoJSON(text, product.includes('VIIRS') ? 'VIIRS' : product.includes('MODIS') ? 'MODIS' : product);
    } finally {
      clearTimeout(timer);
    }
  }

  // GET /api/fires — map display only; results clipped to concession boundary polygon.
  router.get('/', async (req, res) => {
    try {
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 3, 1), 3);
      const bbox = (req.query.bbox || getConcessionFirmsBbox()).trim();
      const mapKey = (process.env.FIRMS_MAP_KEY || '').trim().replace(/^["']|["']$/g, '');

      if (!mapKey) {
        return res.status(503).json({
          success: false,
          error: 'FIRMS API configuration error',
          message: 'Fire data service not configured. Set FIRMS_MAP_KEY in Vercel env vars.',
        });
      }

      const products = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT'];
      const features = [];
      const errors = [];

      for (const product of products) {
        try {
          const data = await fetchFirmsProduct(mapKey, product, bbox, days);
          const tagged = (data.features || []).map((f) => ({
            ...f,
            properties: {
              ...f.properties,
              sensor: product.startsWith('VIIRS') ? 'VIIRS' : product.startsWith('MODIS') ? 'MODIS' : f.properties.sensor,
              product,
            },
          }));
          features.push(...tagged);
        } catch (err) {
          console.error(`FIRMS ${product} failed:`, err.message);
          errors.push(`${product}: ${err.message}`);
        }
      }

      if (features.length === 0 && errors.length > 0) {
        return res.status(502).json({
          success: false,
          error: 'Failed to fetch fire data from NASA FIRMS',
          message: errors[0],
          details: errors,
        });
      }

      const inConcession = filterFiresInConcession(features);

      return res.status(200).json({
        type: 'FeatureCollection',
        features: inConcession,
        meta: {
          days,
          bbox,
          fetched: features.length,
          inConcession: inConcession.length,
          sourcesTried: products,
          sourceErrors: errors,
        },
      });
    } catch (error) {
      console.error('Error fetching fire data:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch fire data',
        message: error.message || 'Unknown fire data error',
      });
    }
  });

  return router;
};
