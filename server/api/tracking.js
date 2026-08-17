const express = require('express');
const { createFieldAuth } = require('../middleware/fieldAuth');
const {
  filterTrackingForRead,
  resolveCreatedByUidForCreate,
} = require('../lib/rbac');

const router = express.Router();

module.exports = (db) => {
  const validateApiKey = createFieldAuth(db);

  router.use(validateApiKey);

  async function displayNameForAuth(req) {
    if (!db || !req.authUid) return null;
    try {
      const snap = await db.collection('users').doc(req.authUid).get();
      if (snap.exists) {
        const name = (snap.data().name || '').trim();
        if (name) return name;
      }
    } catch (err) {
      console.warn('Could not load user name for tracking:', err.message);
    }
    return null;
  }

  // POST /api/tracking - Create new tracking activity
  router.post('/', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({
          success: false,
          error: 'Database not available',
          message: 'Firebase not configured',
        });
      }

      const {
        startTime,
        endTime,
        trackingType,
        vehicle,
        user,
        totalTimeSeconds,
        distanceMeters,
        geoJson,
      } = req.body;

      if (!startTime || !endTime || !trackingType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: startTime, endTime, trackingType',
        });
      }

      if (!['patrol', 'vehicle'].includes(String(trackingType).toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: 'trackingType must be "patrol" or "vehicle"',
        });
      }

      if (trackingType.toLowerCase() === 'vehicle' && !vehicle) {
        return res.status(400).json({
          success: false,
          error: 'vehicle is required when trackingType is "vehicle"',
        });
      }

      const createdByUid = resolveCreatedByUidForCreate(req);
      const displayName =
        (await displayNameForAuth(req)) ||
        (typeof user === 'string' ? user.trim() : '') ||
        'Unknown User';

      const geoJsonStr =
        geoJson != null
          ? typeof geoJson === 'string'
            ? geoJson
            : JSON.stringify(geoJson)
          : null;

      const trackingData = {
        startTime,
        endTime,
        trackingType: String(trackingType).toLowerCase(),
        user: displayName,
        createdByUid,
        totalTimeSeconds: totalTimeSeconds ?? null,
        distanceMeters: distanceMeters ?? null,
        geoJson: geoJsonStr,
        vehicle: trackingType.toLowerCase() === 'vehicle' ? vehicle : null,
        timestamp: new Date().toISOString(),
        synced: true,
      };

      const docRef = await db.collection('tracking').add(trackingData);

      console.log('Tracking activity saved:', docRef.id);

      res.status(201).json({
        success: true,
        message: 'Tracking activity saved successfully',
        data: { id: docRef.id, ...trackingData },
      });
    } catch (error) {
      console.error('Error saving tracking:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save tracking',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  });

  // GET /api/tracking - Fetch tracking activities (role-filtered)
  router.get('/', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({
          success: false,
          error: 'Database not available',
        });
      }

      const snapshot = await db
        .collection('tracking')
        .orderBy('timestamp', 'desc')
        .limit(500)
        .get();

      const activities = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const parsed = { ...data };
        const geoJson = data.geoJson;
        if (typeof geoJson === 'string') {
          try {
            parsed.geoJson = JSON.parse(geoJson);
          } catch {
            parsed.geoJson = geoJson;
          }
        }
        activities.push({ id: doc.id, ...parsed });
      });

      const filtered = filterTrackingForRead(req, activities);

      res.json({
        success: true,
        data: filtered,
        count: filtered.length,
      });
    } catch (error) {
      console.error('Error fetching tracking:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch tracking',
      });
    }
  });

  return router;
};
