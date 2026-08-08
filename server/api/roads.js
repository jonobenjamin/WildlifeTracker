const express = require('express');
const { createFieldAuth } = require('../middleware/fieldAuth');

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
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const coords = [];
  for (const c of raw) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    coords.push([lon, lat]);
  }
  return coords.length >= 2 ? coords : null;
}

module.exports = (db) => {
  const validateApiKey = createFieldAuth(db);
  router.use(validateApiKey);

  // GET /api/roads — all user-drawn roads for map sync
  router.get('/', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

      const snapshot = await db.collection('roads').get();
      const roads = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (Array.isArray(data.coordinates) && data.coordinates.length >= 2) {
          roads.push({ id: doc.id, ...data });
        }
      });
      roads.sort((a, b) => {
        const ta = a.updatedAt || a.createdAt || '';
        const tb = b.updatedAt || b.createdAt || '';
        return String(tb).localeCompare(String(ta));
      });

      res.json({ success: true, data: roads, count: roads.length });
    } catch (error) {
      console.error('GET /api/roads error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch roads' });
    }
  });

  // POST /api/roads — create a GPS-traced road
  router.post('/', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

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
      const doc = {
        name: roadName,
        Roads: roadName,
        coordinates: coords,
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
        data: { id: ref.id, ...doc },
      });
    } catch (error) {
      console.error('POST /api/roads error:', error);
      res.status(500).json({ success: false, error: 'Failed to create road' });
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
      if (coords) updates.coordinates = coords;
      if (req.body.user !== undefined) updates.user = req.body.user;

      await ref.update(updates);
      const updated = await ref.get();
      res.json({ success: true, id, data: { id, ...updated.data() } });
    } catch (error) {
      console.error('PATCH /api/roads error:', error);
      res.status(500).json({ success: false, error: 'Failed to update road' });
    }
  });

  return router;
};
