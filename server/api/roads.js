const express = require('express');
const { createFieldAuth } = require('../middleware/fieldAuth');
const { archiveAndDelete } = require('../lib/archiveDelete');
const {
  filterTreesOrRoadsForRead,
  assertCanMutateRoad,
  resolveCreatedByUidForCreate,
  deletedByFromAuth,
  isStaticRoad,
} = require('../lib/rbac');

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

async function listHiddenStaticIds(db) {
  try {
    const snap = await db.collection('road_tombstones').get();
    return snap.docs.map((d) => d.id);
  } catch (e) {
    console.warn('listHiddenStaticIds:', e.message);
    return [];
  }
}

module.exports = (db) => {
  const validateApiKey = createFieldAuth(db);
  router.use(validateApiKey);

  // GET /api/roads — Firestore roads (user-drawn + any admin overrides).
  // Base network lives in KPR_roads.geojson on clients (same as the phone).
  // Optional ?source=user|static to filter (field PWA should use source=user)
  router.get('/', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
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
      const filtered = filterTreesOrRoadsForRead(req, roads);
      filtered.sort((a, b) => {
        const an = String(a.name || a.Roads || '').toLowerCase();
        const bn = String(b.name || b.Roads || '').toLowerCase();
        if (an !== bn) return an.localeCompare(bn);
        const ta = a.updatedAt || a.createdAt || '';
        const tb = b.updatedAt || b.createdAt || '';
        return String(tb).localeCompare(String(ta));
      });

      const hiddenStaticIds = await listHiddenStaticIds(db);

      res.json({
        success: true,
        data: filtered,
        count: filtered.length,
        hiddenStaticIds,
      });
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
        if (req.authMethod !== 'firebase') {
          const isRevoked = await checkUserRevoked(db, user);
          if (isRevoked) {
            return res.status(403).json({
              success: false,
              error: 'Access denied',
              message: 'Your account has been suspended.',
            });
          }
        }
      }

      const now = new Date().toISOString();
      const createdByUid = resolveCreatedByUidForCreate(req);
      // Store coordinates as JSON string — Firestore rejects nested arrays.
      const doc = {
        name: roadName,
        Roads: roadName,
        coordinates: JSON.stringify(coords),
        user: user || null, // display label only
        createdByUid,
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

  // PATCH /api/roads/:id — update, or upsert base GeoJSON segments on first edit
  router.patch('/:id', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

      const { id } = req.params;
      const ref = db.collection('roads').doc(id);
      const existing = await ref.get();
      const now = new Date().toISOString();

      if (!existing.exists) {
        const coords = normalizeCoordinates(req.body.coordinates);
        const roadName = String(req.body.name || '').trim();
        if (!coords || !roadName) {
          return res.status(404).json({ success: false, error: 'Road not found' });
        }
        const source =
          req.body.source || (String(id).startsWith('static_') ? 'static' : 'user');
        const provisional = { source };

        // Upsert-create: static/system → admin only; user roads → any Firebase user.
        if (isStaticRoad(id, provisional)) {
          if (!assertCanMutateRoad(req, res, provisional, id)) return;
        } else if (req.authMethod !== 'firebase' || !req.authUid) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'You do not have permission to modify this road',
          });
        }

        const createdByUid = resolveCreatedByUidForCreate(req);
        const doc = {
          name: roadName,
          Roads: roadName,
          coordinates: JSON.stringify(coords),
          user: req.body.user !== undefined ? req.body.user : null,
          createdByUid,
          localId: null,
          source,
          createdAt: now,
          updatedAt: now,
        };
        await ref.set(doc);
        // Editing a previously tombstoned base road restores it.
        if (String(id).startsWith('static_')) {
          try {
            await db.collection('road_tombstones').doc(id).delete();
          } catch {
            /* ignore */
          }
        }
        return res.json({ success: true, id, data: roadToClient(id, doc), created: true });
      }

      const current = existing.data() || {};
      if (!assertCanMutateRoad(req, res, current, id)) {
        return;
      }

      const updates = { updatedAt: now };
      if (req.body.name) {
        updates.name = String(req.body.name).trim();
        updates.Roads = updates.name;
      }
      const coords = normalizeCoordinates(req.body.coordinates);
      if (coords) updates.coordinates = JSON.stringify(coords);
      if (req.body.user !== undefined) updates.user = req.body.user;
      // createdByUid / source must not be client-rewritten for ownership bypass

      await ref.update(updates);
      const updated = await ref.get();
      res.json({ success: true, id, data: roadToClient(id, updated.data()) });
    } catch (error) {
      console.error('PATCH /api/roads error:', error);
      res.status(500).json({ success: false, error: 'Failed to update road' });
    }
  });

  // DELETE /api/roads/:id — archive Firestore doc; tombstone base GeoJSON ids
  router.delete('/:id', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }
      const { id } = req.params;
      const ref = db.collection('roads').doc(id);
      const existing = await ref.get();
      const isStatic = isStaticRoad(id, existing.exists ? existing.data() : { source: String(id).startsWith('static_') ? 'static' : 'user' });
      const deletedBy = deletedByFromAuth(req);

      // Authorize before mutate / tombstone.
      const authDoc = existing.exists
        ? existing.data() || {}
        : { source: isStatic ? 'static' : 'user', createdByUid: null };
      if (!assertCanMutateRoad(req, res, authDoc, id)) {
        return;
      }

      let result = { success: true, archived: false, originalId: id, dataType: 'roads' };

      if (existing.exists) {
        result = await archiveAndDelete(db, {
          collection: 'roads',
          id,
          deletedBy,
          dataType: 'roads',
        });
      } else if (!isStatic) {
        return res.status(404).json({ success: false, error: 'Road not found' });
      }

      // Hide base segments that still exist in the public GeoJSON.
      if (isStatic) {
        await db.collection('road_tombstones').doc(id).set({
          deletedAt: new Date().toISOString(),
          deletedBy,
        });
        result.tombstoned = true;
      }

      res.json(result);
    } catch (error) {
      console.error('DELETE /api/roads error:', error);
      const status = error.status || 500;
      res.status(status).json({ success: false, error: error.message || 'Failed to delete road' });
    }
  });

  return router;
};
