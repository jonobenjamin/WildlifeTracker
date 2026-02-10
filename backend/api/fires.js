const express = require('express');
const router = express.Router();

module.exports = (db) => {

// Middleware to validate API key (simple authentication)
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required'
    });
  }

  next();
};

// Apply API key validation to all routes
router.use(validateApiKey);

// GET /api/fires - Fetch fire data from NASA FIRMS API
router.get('/', async (req, res) => {
  try {
    const country = req.query.country || "BWA";
    const days = req.query.days || "3";

    console.log(`Fetching fire data for ${country}, last ${days} days`);

    const BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/geojson";

    // Check if FIRMS_TOKEN environment variable is set
    if (!process.env.FIRMS_TOKEN) {
      console.error('FIRMS_TOKEN environment variable not set');
      return res.status(500).json({
        success: false,
        error: 'FIRMS API configuration error',
        message: 'Fire data service not configured'
      });
    }

    const headers = {
      Authorization: `Bearer ${process.env.FIRMS_TOKEN}`
    };

    // Fetch VIIRS data
    console.log('Fetching VIIRS fire data...');
    const viirsRes = await fetch(
      `${BASE_URL}/VIIRS_SNPP_NRT/${country}/${days}`,
      { headers }
    );

    if (!viirsRes.ok) {
      console.error(`VIIRS API request failed: ${viirsRes.status} ${viirsRes.statusText}`);
      return res.status(viirsRes.status).json({
        success: false,
        error: 'Failed to fetch VIIRS fire data',
        details: `API returned ${viirsRes.status}`
      });
    }

    const viirsData = await viirsRes.json();
    console.log(`VIIRS data: ${viirsData.features ? viirsData.features.length : 0} fires`);

    // Fetch MODIS data
    console.log('Fetching MODIS fire data...');
    const modisRes = await fetch(
      `${BASE_URL}/MODIS_NRT/${country}/${days}`,
      { headers }
    );

    if (!modisRes.ok) {
      console.error(`MODIS API request failed: ${modisRes.status} ${modisRes.statusText}`);
      return res.status(modisRes.status).json({
        success: false,
        error: 'Failed to fetch MODIS fire data',
        details: `API returned ${modisRes.status}`
      });
    }

    const modisData = await modisRes.json();
    console.log(`MODIS data: ${modisData.features ? modisData.features.length : 0} fires`);

    // Tag each feature with sensor type
    const viirsFeatures = (viirsData.features || []).map(f => ({
      ...f,
      properties: {
        ...f.properties,
        sensor: "VIIRS"
      }
    }));

    const modisFeatures = (modisData.features || []).map(f => ({
      ...f,
      properties: {
        ...f.properties,
        sensor: "MODIS"
      }
    }));

    // Merge both datasets
    const combined = {
      type: "FeatureCollection",
      features: [...viirsFeatures, ...modisFeatures]
    };

    console.log(`Total fires returned: ${combined.features.length}`);

    res.status(200).json(combined);

  } catch (error) {
    console.error('Error fetching fire data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fire data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

  return router;
};
