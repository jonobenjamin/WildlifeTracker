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

// API is now write-only - GET endpoints removed for security

// POST /api/observations - Create new observation (WRITE-ONLY API)
router.post('/', async (req, res) => {
  try {
    // Check if Firebase is initialized
    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Database not available',
        message: 'Firebase not configured - observation storage disabled'
      });
    }
    console.log('POST /api/observations received');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const {
      category,
      animal,
      incident_type,
      maintenance_type,
      latitude,
      longitude,
      timestamp
    } = req.body;

    // Validate required fields
    if (!category) {
      return res.status(400).json({
        success: false,
        error: 'Category is required'
      });
    }

    // Validate category-specific fields
    if (category === 'Sighting' && !animal) {
      return res.status(400).json({
        success: false,
        error: 'Animal is required for sightings'
      });
    }

    if (category === 'Incident' && !incident_type) {
      return res.status(400).json({
        success: false,
        error: 'Incident type is required for incidents'
      });
    }

    if (category === 'Maintenance' && !maintenance_type) {
      return res.status(400).json({
        success: false,
        error: 'Maintenance type is required for maintenance'
      });
    }

    const observationData = {
      category,
      timestamp: timestamp || new Date().toISOString(),
      synced: true
    };

    // Add category-specific data
    if (category === 'Sighting') observationData.animal = animal;
    if (category === 'Incident') observationData.incident_type = incident_type;
    if (category === 'Maintenance') observationData.maintenance_type = maintenance_type;

    // Add GPS if provided
    if (latitude !== undefined && longitude !== undefined) {
      observationData.latitude = latitude;
      observationData.longitude = longitude;
    }

    console.log('Attempting to save to Firestore:', observationData);

    const docRef = await db.collection('observations').add(observationData);

    console.log('Successfully saved to Firestore with ID:', docRef.id);

    res.status(201).json({
      success: true,
      message: 'Observation created successfully',
      data: {
        id: docRef.id,
        ...observationData
      }
    });

  } catch (error) {
    console.error('Error creating observation:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create observation',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// API is write-only - only POST / (create) endpoint is available

  return router;
};
