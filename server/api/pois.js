const express = require('express');
const { createFieldAuth } = require('../middleware/fieldAuth');
const { archiveAndDelete } = require('../lib/archiveDelete');
const {
  filterTreesOrRoadsForRead,
  assertCanMutateOwnedRecord,
  resolveCreatedByUidForCreate,
  deletedByFromAuth,
} = require('../lib/rbac');
const { ensureStaticPoisSeeded, mergePoiCatalogue } = require('../lib/seedStaticPois');

const router = express.Router();

function toCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function poiToClient(id, data) {
  const lat = toCoord(data.latitude);
  const lon = toCoord(data.longitude);
  if (lat == null || lon == null) return null;
  return {
    id,
    ...data,
    latitude: lat,
    longitude: lon,
  };
}

module.exports = (db) => {
  const validateApiKey = createFieldAuth(db);
  router.use(validateApiKey);

  // GET /api/pois — full catalogue (seeded GeoJSON + appended field/web adds)
  router.get('/', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

      try {
        await ensureStaticPoisSeeded(db);
      } catch (seedErr) {
        console.warn('POI catalogue seed:', seedErr.message);
      }

      const pois = (await mergePoiCatalogue(db))
        .map((p) => poiToClient(p.id, p))
        .filter(Boolean);
      const filtered = filterTreesOrRoadsForRead(req, pois);
      filtered.sort((a, b) => {
        const an = String(a.name || '').toLowerCase();
        const bn = String(b.name || '').toLowerCase();
        if (an !== bn) return an.localeCompare(bn);
        const ta = a.updatedAt || a.createdAt || '';
        const tb = b.updatedAt || b.createdAt || '';
        return String(tb).localeCompare(String(ta));
      });

      res.json({ success: true, data: filtered, count: filtered.length });
    } catch (error) {
      console.error('GET /api/pois error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch points of interest' });
    }
  });

  // POST /api/pois
  router.post('/', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

      const name = String(req.body.name || req.body.label || '').trim();
      const lat = toCoord(req.body.latitude);
      const lon = toCoord(req.body.longitude);
      const notes = req.body.notes != null ? String(req.body.notes).trim() : '';

      if (!name) {
        return res.status(400).json({ success: false, error: 'Name is required' });
      }
      if (lat == null || lon == null) {
        return res.status(400).json({ success: false, error: 'Valid latitude and longitude required' });
      }

      const now = new Date().toISOString();
      const createdByUid = resolveCreatedByUidForCreate(req);
      const doc = {
        name,
        notes: notes || null,
        latitude: lat,
        longitude: lon,
        source: 'user',
        user: req.body.user || null,
        createdByUid,
        localId: req.body.localId || null,
        createdAt: req.body.createdAt || now,
        updatedAt: now,
      };

      const ref = await db.collection('pois').add(doc);
      res.status(201).json({
        success: true,
        id: ref.id,
        data: poiToClient(ref.id, doc),
      });
    } catch (error) {
      console.error('POST /api/pois error:', error);
      res.status(500).json({ success: false, error: 'Failed to create point of interest' });
    }
  });

  // PATCH /api/pois/:id — update, or upsert a catalogue (GeoJSON) point on first edit
  router.patch('/:id', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }

      const { id } = req.params;
      const ref = db.collection('pois').doc(id);
      const existing = await ref.get();
      const now = new Date().toISOString();
      const isCatalogue = String(id).startsWith('static_poi_');

      if (!existing.exists) {
        const name = String(req.body.name || req.body.label || '').trim();
        const lat = toCoord(req.body.latitude);
        const lon = toCoord(req.body.longitude);
        if (!isCatalogue || !name || lat == null || lon == null) {
          return res.status(404).json({ success: false, error: 'Point of interest not found' });
        }
        const provisional = { createdByUid: null, source: 'static' };
        if (!assertCanMutateOwnedRecord(req, res, provisional, 'point of interest')) {
          return;
        }
        const doc = {
          name,
          notes: req.body.notes != null ? String(req.body.notes).trim() || null : null,
          latitude: lat,
          longitude: lon,
          source: 'static',
          user: req.body.user !== undefined ? req.body.user : 'KPR catalogue',
          createdByUid: null,
          localId: id,
          createdAt: now,
          updatedAt: now,
        };
        await ref.set(doc);
        try {
          await db.collection('poi_tombstones').doc(id).delete();
        } catch {
          /* ignore */
        }
        return res.json({ success: true, id, data: poiToClient(id, doc), created: true });
      }

      const current = existing.data() || {};
      if (!assertCanMutateOwnedRecord(req, res, current, 'point of interest')) {
        return;
      }

      const updates = { updatedAt: now };
      if (req.body.name != null || req.body.label != null) {
        const name = String(req.body.name || req.body.label || '').trim();
        if (name) updates.name = name;
      }
      if (req.body.notes !== undefined) {
        updates.notes = req.body.notes ? String(req.body.notes).trim() : null;
      }
      const lat = toCoord(req.body.latitude);
      const lon = toCoord(req.body.longitude);
      if (lat != null) updates.latitude = lat;
      if (lon != null) updates.longitude = lon;
      if (req.body.user !== undefined) updates.user = req.body.user;

      await ref.update(updates);
      const updated = await ref.get();
      res.json({ success: true, id, data: poiToClient(id, updated.data() || {}) });
    } catch (error) {
      console.error('PATCH /api/pois error:', error);
      res.status(500).json({ success: false, error: 'Failed to update point of interest' });
    }
  });

  // DELETE /api/pois/:id
  router.delete('/:id', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({ success: false, error: 'Database not available' });
      }
      const { id } = req.params;
      const ref = db.collection('pois').doc(id);
      const existing = await ref.get();
      const isCatalogue = String(id).startsWith('static_poi_');
      const deletedBy = deletedByFromAuth(req);
      const authDoc = existing.exists
        ? existing.data() || {}
        : { createdByUid: null, source: 'static' };
      if (!assertCanMutateOwnedRecord(req, res, authDoc, 'point of interest')) {
        return;
      }

      let result = { success: true, archived: false, originalId: id, dataType: 'pois' };
      if (existing.exists) {
        result = await archiveAndDelete(db, {
          collection: 'pois',
          id,
          deletedBy,
          dataType: 'pois',
        });
      } else if (!isCatalogue) {
        return res.status(404).json({ success: false, error: 'Point of interest not found' });
      }

      if (isCatalogue) {
        await db.collection('poi_tombstones').doc(id).set({
          deletedAt: new Date().toISOString(),
          deletedBy,
        });
        result.tombstoned = true;
      }
      res.json(result);
    } catch (error) {
      console.error('DELETE /api/pois error:', error);
      const status = error.status || 500;
      res.status(status).json({ success: false, error: error.message || 'Failed to delete point of interest' });
    }
  });

  return router;
};
