const express = require('express');
const { createFieldAuth } = require('../middleware/fieldAuth');

const router = express.Router();

const VALID_SPECIES = [
  'Sossage Tree',
  'Sickle Leaved Albizia',
  'African Mangosteen',
  'Camel Thorn',
  'Fig Tree',
  'Jackal Berry',
  'Knob Thorn',
  'Baobab',
  'Other',
];

const WRAPPED_STATUSES = ['Wrapped', 'To be Wrapped'];

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
    console.error('Tree user check error:', error);
    return false;
  }
}

function historyEntry(value, date) {
  return { value, date: date || new Date().toISOString() };
}

function wrappedEntry(status, date) {
  return { status, date: date || new Date().toISOString() };
}

module.exports = (db) => {
  const validateApiKey = createFieldAuth(db);

  router.use(validateApiKey);

  // GET /api/trees — all trees for map sync
  router.get('/', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

      const snapshot = await db.collection('trees').get();
      const trees = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.latitude !== undefined && data.longitude !== undefined) {
          trees.push({ id: doc.id, ...data });
        }
      });
      trees.sort((a, b) => {
        const ta = a.updatedAt || a.createdAt || '';
        const tb = b.updatedAt || b.createdAt || '';
        return tb.localeCompare(ta);
      });

      res.json({ success: true, data: trees, count: trees.length });
    } catch (error) {
      console.error('GET /api/trees error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch trees' });
    }
  });

  // POST /api/trees — create tree at GPS with initial measurements
  router.post('/', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

      const {
        species,
        speciesOther,
        latitude,
        longitude,
        user,
        localId,
        wrappedStatus,
        dbh,
        canopyCover,
      } = req.body;

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

      if (!species || !VALID_SPECIES.includes(species)) {
        return res.status(400).json({
          success: false,
          error: `Species must be one of: ${VALID_SPECIES.join(', ')}`,
        });
      }

      if (species === 'Other' && !speciesOther) {
        return res.status(400).json({ success: false, error: 'speciesOther required when species is Other' });
      }

      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ success: false, error: 'latitude and longitude are required' });
      }

      const now = new Date().toISOString();
      const treeData = {
        species,
        speciesOther: species === 'Other' ? speciesOther : null,
        latitude: Number(latitude),
        longitude: Number(longitude),
        user: user || 'Unknown User',
        localId: localId || null,
        createdAt: now,
        updatedAt: now,
        wrappedHistory: [],
        dbhHistory: [],
        canopyHistory: [],
        synced: true,
      };

      // Accept either full history arrays (offline-first sync) or single values
      if (Array.isArray(req.body.wrappedHistory) && req.body.wrappedHistory.length > 0) {
        treeData.wrappedHistory = req.body.wrappedHistory
          .filter(h => h && WRAPPED_STATUSES.includes(h.status))
          .map(h => wrappedEntry(h.status, h.date || now));
      } else if (wrappedStatus && WRAPPED_STATUSES.includes(wrappedStatus)) {
        treeData.wrappedHistory.push(wrappedEntry(wrappedStatus, now));
      }

      if (Array.isArray(req.body.dbhHistory) && req.body.dbhHistory.length > 0) {
        treeData.dbhHistory = req.body.dbhHistory
          .filter(h => h && h.value !== undefined && h.value !== null)
          .map(h => historyEntry(Number(h.value), h.date || now));
      } else if (dbh !== undefined && dbh !== null && dbh !== '') {
        treeData.dbhHistory.push(historyEntry(Number(dbh), now));
      }

      if (Array.isArray(req.body.canopyHistory) && req.body.canopyHistory.length > 0) {
        treeData.canopyHistory = req.body.canopyHistory
          .filter(h => h && h.value !== undefined && h.value !== null)
          .map(h => historyEntry(Number(h.value), h.date || now));
      } else if (canopyCover !== undefined && canopyCover !== null && canopyCover !== '') {
        treeData.canopyHistory.push(historyEntry(Number(canopyCover), now));
      }

      const docRef = await db.collection('trees').add(treeData);

      res.status(201).json({
        success: true,
        id: docRef.id,
        data: { id: docRef.id, ...treeData },
      });
    } catch (error) {
      console.error('POST /api/trees error:', error);
      res.status(500).json({ success: false, error: 'Failed to create tree' });
    }
  });

  // PATCH /api/trees/:id — append measurements (DBH, canopy, wrapped)
  router.patch('/:id', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

      const { id } = req.params;
      const { user, wrappedStatus, dbh, canopyCover } = req.body;

      if (user) {
        const isRevoked = await checkUserRevoked(db, user);
        if (isRevoked) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }

      const docRef = db.collection('trees').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) {
        return res.status(404).json({ success: false, error: 'Tree not found' });
      }

      const now = new Date().toISOString();
      const data = doc.data();
      const updates = { updatedAt: now };

      // Full-array replace mode (offline-first sync from client with accumulated readings)
      // If client sends full history arrays, they are treated as authoritative and replace
      // the server copy. Falls back to append-single-value for simple online use.
      if (Array.isArray(req.body.wrappedHistory)) {
        updates.wrappedHistory = req.body.wrappedHistory
          .filter(h => h && WRAPPED_STATUSES.includes(h.status))
          .map(h => wrappedEntry(h.status, h.date || now));
      } else {
        const wrappedHistory = [...(data.wrappedHistory || [])];
        if (wrappedStatus && WRAPPED_STATUSES.includes(wrappedStatus)) {
          wrappedHistory.push(wrappedEntry(wrappedStatus, now));
        }
        updates.wrappedHistory = wrappedHistory;
      }

      if (Array.isArray(req.body.dbhHistory)) {
        updates.dbhHistory = req.body.dbhHistory
          .filter(h => h && h.value !== undefined && h.value !== null)
          .map(h => historyEntry(Number(h.value), h.date || now));
      } else {
        const dbhHistory = [...(data.dbhHistory || [])];
        if (dbh !== undefined && dbh !== null && dbh !== '') {
          dbhHistory.push(historyEntry(Number(dbh), now));
        }
        updates.dbhHistory = dbhHistory;
      }

      if (Array.isArray(req.body.canopyHistory)) {
        updates.canopyHistory = req.body.canopyHistory
          .filter(h => h && h.value !== undefined && h.value !== null)
          .map(h => historyEntry(Number(h.value), h.date || now));
      } else {
        const canopyHistory = [...(data.canopyHistory || [])];
        if (canopyCover !== undefined && canopyCover !== null && canopyCover !== '') {
          canopyHistory.push(historyEntry(Number(canopyCover), now));
        }
        updates.canopyHistory = canopyHistory;
      }

      await docRef.update(updates);

      const updated = await docRef.get();
      res.json({ success: true, data: { id: updated.id, ...updated.data() } });
    } catch (error) {
      console.error('PATCH /api/trees error:', error);
      res.status(500).json({ success: false, error: 'Failed to update tree' });
    }
  });

  return router;
};
