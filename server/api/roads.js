const express = require('express');
const { createFieldAuth } = require('../middleware/fieldAuth');
const { archiveAndDelete } = require('../lib/archiveDelete');
const { ensureStaticRoadsSeeded } = require('../lib/seedStaticRoads');

const router = express.Router();

async function checkUserRevoked(db, userIdentifier) {
  try {
    if (!userIdentifier) return false;
    let userDoc = await db.collection('users').doc(userIdentifier).get();
    if (!userDoc.exists && userIdentifier.includes('@')) {
      const emailKey = userIdentifier.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
      userDoc = await db.collection('users').doc('email_' + emailKey).get();
    }
    if (!userDoc.exists) {
      const usersSnapshot = await db.collection('users').get();
      for (const doc of usersSnapshot.docs) {
        const data = doc.data();
        if (
          data.email === userIdentifier ||
          data.uid === userIdentifier ||
          data.name === userIdentifier
        ) {
          userDoc = doc;
          break;
        }
      }
    }
    if (!userDoc.exists) return false;
    return userDoc.data().status === 'revoked';
  } catch (error) {
    console.error('Road user check error:', error);
    return false;
  }
}

function normalizeCoordinates(raw) {
  // Accept array or JSON string (Firestore cannot store nested arrays).
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list) || list.length < 2) return null;
  const coords = [];
  for (const c of list) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    coords.push([lon, lat]);
  }
  return coords.length >= 2 ? coords : null;
}

/** Shape a Firestore road doc for API clients (coordinates always as array). */
function roadToClient(id, data) {
  const coords = normalizeCoordinates(data.coordinates);
  if (!coords) return null;
  return {
    id,
    ...data,
    coordinates: coords,
  };
}

module.exports = (db) => {
  const validateApiKey = createFieldAuth(db);
  router.use(validateApiKey);

  // GET /api/roads — all roads (static base + user segments) after one-time seed
  // Optional ?source=user|static to filter (field PWA should use source=user)
  router.get('/', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

      // Seed/resume until complete (or one pass). Partial seeds continue on next GET.
      let seedResult = await ensureStaticRoadsSeeded(db);
      if (seedResult && seedResult.complete === false && seedResult.reason === 'partial') {
        seedResult = await ensureStaticRoadsSeeded(db);
      }

      const sourceFilter = String(req.query.source || '').toLowerCase().trim();
      let snapshot;
      if (sourceFilter === 'user' || sourceFilter === 'static') {
        snapshot = await db.collection('roads').where('source', '==', sourceFilter).get();
      } else {
        snapshot = await db.collection('roads').get();
      }

      const roads = [];
      snapshot.forEach((doc) => {
        const shaped = roadToClient(doc.id, doc.data());
        if (shaped) roads.push(shaped);
      });
      roads.sort((a, b) => {
        const an = String(a.name || a.Roads || '').toLowerCase();
        const bn = String(b.name || b.Roads || '').toLowerCase();
        if (an !== bn) return an.localeCompare(bn);
        const ta = a.updatedAt || a.createdAt || '';
        const tb = b.updatedAt || b.createdAt || '';
        return String(tb).localeCompare(String(ta));
      });

      res.json({
        success: true,
        data: roads,
        count: roads.length,
        seed: seedResult,
      });
    } catch (error) {
      console.error('GET /api/roads error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch roads' });
    }
  });

  // POST /api/roads — create a GPS-traced road (appended to the same collection)
  router.post('/', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

      // Ensure base network exists first so user roads sit alongside it.
      await ensureStaticRoadsSeeded(db);

      const { name, coordinates, user, localId, createdAt } = req.body;
      const roadName = String(name || '').trim();
      const coords = normalizeCoordinates(coordinates);

      if (!roadName) {
        return res.status(400).json({ success: false, error: 'Road name is required' });
      }
      if (!coords) {
        return res.status(400).json({ success: false, error: 'Valid coordinates required' });
      }

      if (user) {
        const isRevoked = await checkUserRevoked(db, user);
        if (isRevoked) {
          return res.status(403).json({
            success: false,
            error: 'Access denied',
            message: 'Your account has been suspended.',
          });
        }
      }

      const now = new Date().toISOString();
      // Store coordinates as JSON string — Firestore rejects nested arrays.
      const doc = {
        name: roadName,
        Roads: roadName,
        coordinates: JSON.stringify(coords),
        user: user || null,
        localId: localId || null,
        source: 'user',
        createdAt: createdAt || now,
        updatedAt: now,
      };

      const ref = await db.collection('roads').add(doc);
      res.status(201).json({
        success: true,
        id: ref.id,
        data: roadToClient(ref.id, doc),
      });
    } catch (error) {
      console.error('POST /api/roads error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create road',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  });

  // PATCH /api/roads/:id
  router.patch('/:id', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

      const { id } = req.params;
      const ref = db.collection('roads').doc(id);
      const existing = await ref.get();
      if (!existing.exists) {
        return res.status(404).json({ success: false, error: 'Road not found' });
      }

      const updates = { updatedAt: new Date().toISOString() };
      if (req.body.name) {
        updates.name = String(req.body.name).trim();
        updates.Roads = updates.name;
      }
      const coords = normalizeCoordinates(req.body.coordinates);
      if (coords) updates.coordinates = JSON.stringify(coords);
      if (req.body.user !== undefined) updates.user = req.body.user;

      await ref.update(updates);
      const updated = await ref.get();
      res.json({ success: true, id, data: roadToClient(id, updated.data()) });
    } catch (error) {
      console.error('PATCH /api/roads error:', error);
      res.status(500).json({ success: false, error: 'Failed to update road' });
    }
  });

  // DELETE /api/roads/:id — archive then remove
  router.delete('/:id', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }
      const { id } = req.params;
      const deletedBy = req.body?.deletedBy || req.query?.deletedBy || 'unknown';
      const result = await archiveAndDelete(db, {
        collection: 'roads',
        id,
        deletedBy,
        dataType: 'roads',
      });
      res.json(result);
    } catch (error) {
      console.error('DELETE /api/roads error:', error);
      const status = error.status || 500;
      res.status(status).json({ success: false, error: error.message || 'Failed to delete road' });
    }
  });

  return router;
};
