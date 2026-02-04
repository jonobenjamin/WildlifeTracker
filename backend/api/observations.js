const express = require('express');
const { sendPoachingIncidentNotifications, isPoachingIncident } = require('../services/notificationServices');

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

// GET /api/observations - Fetch observations for map display (READ-ONLY with location data only)
router.get('/', async (req, res) => {
  try {
    // Check if Firebase is initialized
    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Database not available',
        message: 'Firebase not configured - observation data unavailable'
      });
    }

    console.log('GET /api/observations requested for map display');

    // Fetch observations from Firestore
    const snapshot = await db.collection('observations')
      .orderBy('timestamp', 'desc')
      .get();

    const observations = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Only include location-based data for map display
      const observation = {
        id: doc.id,
        category: data.category,
        timestamp: data.timestamp,
        synced: data.synced,
        user: data.user // Include user information
      };

      // Add category-specific data (without sensitive information)
      if (data.category === 'Sighting' && data.animal) {
        observation.animal = data.animal;
      }
      if (data.category === 'Incident' && data.incident_type) {
        observation.incident_type = data.incident_type;
      }
      if (data.category === 'Maintenance' && data.maintenance_type) {
        observation.maintenance_type = data.maintenance_type;
      }

      // Only include GPS coordinates if they exist
      if (data.latitude !== undefined && data.longitude !== undefined) {
        observation.latitude = data.latitude;
        observation.longitude = data.longitude;
      }

      // Only include observations that have location data
      if (observation.latitude !== undefined && observation.longitude !== undefined) {
        observations.push(observation);
      }
    });

    console.log(`Successfully fetched ${observations.length} observations with location data`);

    res.json({
      success: true,
      message: 'Observations fetched successfully',
      data: observations,
      count: observations.length
    });

  } catch (error) {
    console.error('Error fetching observations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch observations',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/observations - Create new observation
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
      timestamp,
      user
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
      synced: true,
      user: user // Add user information
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

    // Send email notification if this is a poaching incident
    const savedObservation = {
      id: docRef.id,
      ...observationData
    };
    
    if (isPoachingIncident(savedObservation)) {
      console.log('🚨 Poaching incident detected - sending email notification');
      try {
        // Wait for email to send before responding (important for serverless functions)
        const emailResults = await sendPoachingIncidentNotifications(savedObservation);
        console.log('Email notification sent:', emailResults);
      } catch (error) {
        console.error('Email notification failed:', error);
        // Don't fail the whole request if email fails, just log it
      }
    }

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
