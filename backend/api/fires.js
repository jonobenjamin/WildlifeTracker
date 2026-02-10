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
    const country = req.query.country || "AFR"; // Changed from BWA to AFR (Africa continent)
    const days = req.query.days || "3";

    console.log(`Fetching fire data for ${country}, last ${days} days`);

    const BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/geojson";

    // Check if FIRMS_MAP_KEY environment variable is set
    if (!process.env.FIRMS_MAP_KEY) {
      console.error('FIRMS_MAP_KEY environment variable not set');
      return res.status(500).json({
        success: false,
        error: 'FIRMS API configuration error',
        message: 'Fire data service not configured. Please set FIRMS_MAP_KEY environment variable.'
      });
    }

    // FIRMS API uses MAP_KEY as query parameter, not Bearer token
    const mapKey = process.env.FIRMS_MAP_KEY;

    // Fetch VIIRS data
    console.log('Fetching VIIRS fire data...');
    const viirsUrl = `${BASE_URL}/VIIRS_SNPP_NRT/${country}/${days}?MAP_KEY=${mapKey}`;
    console.log('VIIRS URL:', viirsUrl);
    const viirsRes = await fetch(viirsUrl);

    console.log('VIIRS Response status:', viirsRes.status, viirsRes.statusText);
    console.log('VIIRS Response headers:', Object.fromEntries(viirsRes.headers.entries()));

    // Get response text
    const responseText = await viirsRes.text();
    console.log('VIIRS Response preview (first 500 chars):', responseText.substring(0, 500));

    // Check if response is HTML error page
    if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
      console.error('VIIRS API returned HTML error page instead of JSON');
      return res.status(500).json({
        success: false,
        error: 'FIRMS API returned HTML error page',
        details: `API returned HTML instead of JSON. Check MAP_KEY validity. Response: ${responseText.substring(0, 200)}`
      });
    }

    // Parse as JSON
    let viirsData;
    try {
      viirsData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse VIIRS response as JSON:', parseError.message);
      return res.status(500).json({
        success: false,
        error: 'Invalid JSON response from FIRMS API',
        details: `Response parsing failed: ${parseError.message}. Response: ${responseText.substring(0, 200)}`
      });
    }

    if (!viirsRes.ok) {
      console.error(`VIIRS API request failed: ${viirsRes.status} ${viirsRes.statusText}`);
      console.error('VIIRS URL used:', viirsUrl);
      return res.status(viirsRes.status).json({
        success: false,
        error: 'Failed to fetch VIIRS fire data',
        details: `API returned ${viirsRes.status}: ${responseText.substring(0, 200)}`
      });
    }
    console.log(`VIIRS data: ${viirsData.features ? viirsData.features.length : 0} fires`);

    // Fetch MODIS data
    console.log('Fetching MODIS fire data...');
    const modisUrl = `${BASE_URL}/MODIS_NRT/${country}/${days}?MAP_KEY=${mapKey}`;
    console.log('MODIS URL:', modisUrl);
    const modisRes = await fetch(modisUrl);

    console.log('MODIS Response status:', modisRes.status, modisRes.statusText);
    console.log('MODIS Response headers:', Object.fromEntries(modisRes.headers.entries()));

    // Get response text
    const modisResponseText = await modisRes.text();
    console.log('MODIS Response preview (first 500 chars):', modisResponseText.substring(0, 500));

    // Check if response is HTML error page
    if (modisResponseText.trim().startsWith('<!DOCTYPE') || modisResponseText.trim().startsWith('<html')) {
      console.error('MODIS API returned HTML error page instead of JSON');
      return res.status(500).json({
        success: false,
        error: 'FIRMS API returned HTML error page',
        details: `API returned HTML instead of JSON. Check MAP_KEY validity. Response: ${modisResponseText.substring(0, 200)}`
      });
    }

    // Parse as JSON
    let modisData;
    try {
      modisData = JSON.parse(modisResponseText);
    } catch (parseError) {
      console.error('Failed to parse MODIS response as JSON:', parseError.message);
      return res.status(500).json({
        success: false,
        error: 'Invalid JSON response from FIRMS API',
        details: `Response parsing failed: ${parseError.message}. Response: ${modisResponseText.substring(0, 200)}`
      });
    }

    if (!modisRes.ok) {
      console.error(`MODIS API request failed: ${modisRes.status} ${modisRes.statusText}`);
      console.error('MODIS URL used:', modisUrl);
      return res.status(modisRes.status).json({
        success: false,
        error: 'Failed to fetch MODIS fire data',
        details: `API returned ${modisRes.status}: ${modisResponseText.substring(0, 200)}`
      });
    }
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
