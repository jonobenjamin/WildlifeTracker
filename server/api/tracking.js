const express = require('express');
const { createFieldAuth } = require('../middleware/fieldAuth');
const { archiveAndDelete } = require('../lib/archiveDelete');
const {
  filterTrackingForRead,
  resolveCreatedByUidForCreate,
  assertCanMutateOwnedRecord,
  deletedByFromAuth,
} = require('../lib/rbac');

const router = express.Router();

function parseStoredGeoJson(geoJson) {
  if (geoJson == null) return null;
  if (typeof geoJson === 'string') {
    try {
      return JSON.parse(geoJson);
    } catch {
      return geoJson;
    }
  }
  return geoJson;
}

function serializeGeoJson(geoJson) {
  if (geoJson == null) return null;
  return typeof geoJson === 'string' ? geoJson : JSON.stringify(geoJson);
}

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
        activities.push({
          id: doc.id,
          ...data,
          geoJson: parseStoredGeoJson(data.geoJson),
        });
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

  // PATCH /api/tracking/:id — update metadata (geometry kept unless explicitly sent)
  router.patch('/:id', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

      const { id } = req.params;
      const ref = db.collection('tracking').doc(id);
      const snap = await ref.get();
      if (!snap.exists) {
        return res.status(404).json({ success: false, error: 'Tracking record not found' });
      }

      const existing = snap.data() || {};
      if (!assertCanMutateOwnedRecord(req, res, existing, 'tracking record')) {
        return;
      }

      const updates = {};
      if (req.body.startTime !== undefined) updates.startTime = req.body.startTime;
      if (req.body.endTime !== undefined) updates.endTime = req.body.endTime;
      if (req.body.user !== undefined) updates.user = String(req.body.user || '').trim() || existing.user;
      if (req.body.totalTimeSeconds !== undefined) {
        const n = Number(req.body.totalTimeSeconds);
        updates.totalTimeSeconds = Number.isFinite(n) ? n : null;
      }
      if (req.body.distanceMeters !== undefined) {
        const n = Number(req.body.distanceMeters);
        updates.distanceMeters = Number.isFinite(n) ? n : null;
      }

      let nextType = existing.trackingType;
      if (req.body.trackingType !== undefined) {
        const t = String(req.body.trackingType || '').toLowerCase();
        if (!['patrol', 'vehicle'].includes(t)) {
          return res.status(400).json({
            success: false,
            error: 'trackingType must be "patrol" or "vehicle"',
          });
        }
        updates.trackingType = t;
        nextType = t;
      }

      if (req.body.vehicle !== undefined || updates.trackingType) {
        if (String(nextType).toLowerCase() === 'vehicle') {
          const vehicle =
            req.body.vehicle !== undefined
              ? String(req.body.vehicle || '').trim()
              : existing.vehicle;
          if (!vehicle) {
            return res.status(400).json({
              success: false,
              error: 'vehicle is required when trackingType is "vehicle"',
            });
          }
          updates.vehicle = vehicle;
        } else {
          updates.vehicle = null;
        }
      }

      if (req.body.geoJson !== undefined) {
        updates.geoJson = serializeGeoJson(req.body.geoJson);
      }

      updates.updatedAt = new Date().toISOString();
      await ref.update(updates);

      const updated = (await ref.get()).data() || {};
      res.json({
        success: true,
        data: {
          id,
          ...updated,
          geoJson: parseStoredGeoJson(updated.geoJson),
        },
      });
    } catch (error) {
      console.error('PATCH /api/tracking error:', error);
      res.status(500).json({ success: false, error: 'Failed to update tracking' });
    }
  });

  // DELETE /api/tracking/:id — archive then remove
  router.delete('/:id', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

      const { id } = req.params;
      const snap = await db.collection('tracking').doc(id).get();
      if (!snap.exists) {
        return res.status(404).json({ success: false, error: 'Tracking record not found' });
      }
      if (!assertCanMutateOwnedRecord(req, res, snap.data() || {}, 'tracking record')) {
        return;
      }

      const deletedBy =
        (typeof req.body?.deletedBy === 'string' && req.body.deletedBy.trim()) ||
        (typeof req.query?.deletedBy === 'string' && String(req.query.deletedBy).trim()) ||
        deletedByFromAuth(req);

      const result = await archiveAndDelete(db, {
        collection: 'tracking',
        id,
        deletedBy,
        dataType: 'tracking',
      });
      res.json(result);
    } catch (error) {
      console.error('DELETE /api/tracking error:', error);
      const status = error.status || 500;
      res.status(status).json({
        success: false,
        error: error.message || 'Failed to delete tracking',
      });
    }
  });

  return router;
};
