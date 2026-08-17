const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { createFieldAuth } = require('../middleware/fieldAuth');
const { getDb } = require('../firestoreDb');

const router = express.Router();

router.use(createFieldAuth(getDb()));

function geoJsonPath(filename) {
  return path.join(process.cwd(), 'public', 'data', 'geojson', filename);
}

async function serveGeoJson(req, res, filename) {
  const filePath = geoJsonPath(filename);
  try {
    await fs.access(filePath);
  } catch (error) {
    console.error('GeoJSON file not found:', filePath);
    return res.status(404).json({
      error: 'Not Found',
      message: `${filename} not found`,
    });
  }

  const raw = await fs.readFile(filePath, 'utf8');
  res.setHeader('Content-Type', 'application/json');
  res.send(raw);
}

// GET /api/map/boundary - Get concession boundary GeoJSON
router.get('/boundary', async (req, res) => {
  try {
    console.log('GET /api/map/boundary requested');
    await serveGeoJson(req, res, 'Consession_boundary.geojson');
  } catch (error) {
    console.error('Error serving boundary data:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to load boundary data',
    });
  }
});

// GET /api/map/roads - Get road network GeoJSON
router.get('/roads', async (req, res) => {
  try {
    console.log('GET /api/map/roads requested');
    await serveGeoJson(req, res, 'KPR_roads.geojson');
  } catch (error) {
    console.error('Error serving roads data:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to load roads data',
    });
  }
});

module.exports = router;
