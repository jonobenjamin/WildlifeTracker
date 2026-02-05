const express = require('express');
const multer = require('multer');
const { getStorage } = require('firebase-admin/storage');
const { sendPoachingIncidentNotifications, isPoachingIncident } = require('../services/notificationServices');

const router = express.Router();

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

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
        if (data.poaching_type) {
          observation.poaching_type = data.poaching_type;
        }
      }
      if (data.category === 'Maintenance' && data.maintenance_type) {
        observation.maintenance_type = data.maintenance_type;
      }

      // Add image data if available (path for secure access, filename for display)
      if (data.image_path) {
        observation.has_image = true;
        observation.image_filename = data.image_filename;
        // Note: image_url is not provided - images must be accessed via secure endpoint
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
router.post('/', upload.single('image'), async (req, res) => {
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
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body fields:', Object.keys(req.body));
    console.log('Body values:', JSON.stringify(req.body, null, 2));
    console.log('File present:', !!req.file);
    if (req.file) {
      console.log('File details:', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        encoding: req.file.encoding,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer ? `Present (${req.file.buffer.length} bytes)` : 'Missing'
      });
    } else {
      console.log('No file received - check if frontend is sending image as multipart/form-data');
    }

    const {
      category,
      animal,
      incident_type,
      poaching_type,
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

    // Validate poaching type for poaching incidents
    const validPoachingTypes = ['Carcass', 'Snare', 'Poacher'];
    if (category === 'Incident' && incident_type && incident_type.toLowerCase().includes('poach')) {
      if (!poaching_type || !validPoachingTypes.includes(poaching_type)) {
        return res.status(400).json({
          success: false,
          error: `Poaching type must be one of: ${validPoachingTypes.join(', ')}`
        });
      }
    }

    const observationData = {
      category,
      timestamp: timestamp || new Date().toISOString(),
      synced: true,
      user: user // Add user information
    };

    // Add category-specific data
    if (category === 'Sighting') observationData.animal = animal;
    if (category === 'Incident') {
      observationData.incident_type = incident_type;
      if (poaching_type) observationData.poaching_type = poaching_type;
    }
    if (category === 'Maintenance') observationData.maintenance_type = maintenance_type;

    // Add GPS if provided
    if (latitude !== undefined && longitude !== undefined) {
      observationData.latitude = latitude;
      observationData.longitude = longitude;
    }

    // Handle image upload to Firebase Storage
    // Support both multipart/form-data files and base64 JSON fields
    let imageBuffer = null;
    let imageMimeType = null;
    let imageOriginalName = null;

    if (req.file) {
      // Multipart/form-data upload
      console.log('📸 Image file detected (multipart/form-data)');
      imageBuffer = req.file.buffer;
      imageMimeType = req.file.mimetype;
      imageOriginalName = req.file.originalname;
    } else if (req.body.poaching_image && req.body.poaching_image_name) {
      // Base64 JSON upload (current frontend method)
      console.log('📸 Image data detected (base64 JSON)');
      try {
        // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
        const base64Data = req.body.poaching_image.replace(/^data:image\/[a-z]+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
        imageMimeType = 'image/jpeg'; // Default, could be detected from data URL
        imageOriginalName = req.body.poaching_image_name;
        console.log('✅ Base64 image decoded, size:', imageBuffer.length, 'bytes');
      } catch (decodeError) {
        console.error('❌ Failed to decode base64 image:', decodeError.message);
      }
    }

    // Upload image if we have data
    if (imageBuffer && imageMimeType && imageOriginalName) {
      console.log('📤 Attempting Firebase Storage upload...');
      try {
        const bucket = getStorage().bucket();
        const fileName = `observations/${Date.now()}_${imageOriginalName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const file = bucket.file(fileName);

        console.log('📤 Uploading to Firebase Storage:', fileName);

        await file.save(imageBuffer, {
          metadata: {
            contentType: imageMimeType,
            metadata: {
              uploadedBy: user || 'unknown',
              originalName: imageOriginalName,
              uploadTimestamp: new Date().toISOString(),
              category: category,
              incident_type: incident_type || null,
              poaching_type: poaching_type || null
            }
          },
        });

        // Store the image path for secure access
        observationData.image_path = fileName;
        observationData.image_filename = imageOriginalName;

        console.log('✅ Image uploaded successfully to Firebase Storage:', fileName);

      } catch (error) {
        console.error('❌ Image upload failed:', error.message);
        // Continue without image if upload fails
      }
    } else {
      console.log('ℹ️ No image data found to upload');
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

// GET /api/observations/:id/image - Secure image access
router.get('/:id/image', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Observation ID is required'
      });
    }

    // Get observation data to verify it exists and has an image
    const doc = await db.collection('observations').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Observation not found'
      });
    }

    const observationData = doc.data();
    if (!observationData.image_path) {
      return res.status(404).json({
        success: false,
        error: 'No image found for this observation'
      });
    }

    // Get the image from Firebase Storage
    const bucket = getStorage().bucket();
    const file = bucket.file(observationData.image_path);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'Image file not found in storage'
      });
    }

    // Generate signed URL (valid for 1 hour)
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    // Redirect to signed URL or stream the image
    // Using redirect for simplicity and performance
    res.redirect(signedUrl);

  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve image',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// API supports POST / (create) and GET /:id/image (secure image access)

  return router;
};
