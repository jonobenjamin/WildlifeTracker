const express = require('express');
const multer = require('multer');
const { getStorage } = require('firebase-admin/storage');
const { createFieldAuth } = require('../middleware/fieldAuth');
const { normalizeRole } = require('../lib/rbac');
const {
  buildDefaultSpecies,
  buildDefaultIncidents,
  SPECIES_COLLECTION,
  INCIDENTS_COLLECTION,
} = require('../lib/appConfigDefaults');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok =
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'image/svg+xml' ||
      (file.originalname || '').toLowerCase().endsWith('.svg');
    if (ok) cb(null, true);
    else cb(new Error('Only image or SVG files are allowed'));
  },
});

function requireAdmin(req, res) {
  if (normalizeRole(req.authRole) !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Admin role required for app configuration',
    });
    return false;
  }
  return true;
}

function cleanStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || '').trim()).filter(Boolean);
}

function slugify(name) {
  return (
    String(name || 'item')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'item'
  );
}

async function listCollection(db, collection) {
  const snap = await db.collection(collection).orderBy('sortOrder', 'asc').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function ensureSeeded(db) {
  const [speciesSnap, incidentsSnap] = await Promise.all([
    db.collection(SPECIES_COLLECTION).limit(1).get(),
    db.collection(INCIDENTS_COLLECTION).limit(1).get(),
  ]);

  const seeded = { species: 0, incidents: 0 };
  const now = new Date().toISOString();

  if (speciesSnap.empty) {
    const batch = db.batch();
    buildDefaultSpecies().forEach((row) => {
      const ref = db.collection(SPECIES_COLLECTION).doc();
      batch.set(ref, { ...row, createdAt: now, updatedAt: now });
      seeded.species += 1;
    });
    await batch.commit();
  }

  if (incidentsSnap.empty) {
    const batch = db.batch();
    buildDefaultIncidents().forEach((row) => {
      const ref = db.collection(INCIDENTS_COLLECTION).doc();
      batch.set(ref, { ...row, createdAt: now, updatedAt: now });
      seeded.incidents += 1;
    });
    await batch.commit();
  }

  return seeded;
}

async function uploadIcon({ buffer, mimetype, originalname, folder, id }) {
  const bucket = getStorage().bucket();
  const safeName = String(originalname || 'icon.svg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `app-config/${folder}/${id}_${Date.now()}_${safeName}`;
  const file = bucket.file(fileName);
  const contentType =
    mimetype === 'image/svg+xml' || safeName.toLowerCase().endsWith('.svg')
      ? 'image/svg+xml'
      : mimetype || 'application/octet-stream';

  await file.save(buffer, {
    metadata: {
      contentType,
      metadata: { folder, configId: id, originalName: originalname || safeName },
    },
  });

  let iconUrl = null;
  try {
    await file.makePublic();
    iconUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  } catch {
    iconUrl = `/api/app-config/icon?path=${encodeURIComponent(fileName)}`;
  }

  return { iconPath: fileName, iconUrl };
}

module.exports = (db) => {
  const router = express.Router();
  router.use(createFieldAuth(db));

  router.get('/', async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
      const seeded = await ensureSeeded(db);
      const [species, incidents] = await Promise.all([
        listCollection(db, SPECIES_COLLECTION),
        listCollection(db, INCIDENTS_COLLECTION),
      ]);
      res.json({ success: true, data: { species, incidents }, seeded });
    } catch (error) {
      console.error('GET /api/app-config error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to load app config' });
    }
  });

  router.post('/seed', async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
      const seeded = await ensureSeeded(db);
      res.json({ success: true, seeded });
    } catch (error) {
      console.error('POST /api/app-config/seed error:', error);
      res.status(500).json({ success: false, error: error.message || 'Seed failed' });
    }
  });

  router.post('/species', async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ success: false, error: 'name is required' });
      const taxa = String(req.body.taxa || 'Mammals').trim();
      if (!['Aves', 'Mammals', 'Reptiles'].includes(taxa)) {
        return res.status(400).json({ success: false, error: 'taxa must be Aves, Mammals, or Reptiles' });
      }
      const profile = String(req.body.profile || 'general').toLowerCase() === 'high' ? 'high' : 'general';
      const now = new Date().toISOString();
      const existing = await db.collection(SPECIES_COLLECTION).orderBy('sortOrder', 'desc').limit(1).get();
      const sortOrder =
        req.body.sortOrder != null
          ? Number(req.body.sortOrder)
          : existing.empty
            ? 0
            : Number(existing.docs[0].data().sortOrder || 0) + 1;
      const doc = {
        name,
        scientificName: String(req.body.scientificName || '').trim(),
        taxa,
        profile,
        ageCategories: cleanStringList(req.body.ageCategories),
        activities: cleanStringList(req.body.activities),
        knownNames: cleanStringList(req.body.knownNames),
        iconUrl: req.body.iconUrl || null,
        iconPath: req.body.iconPath || null,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        active: req.body.active !== false,
        createdAt: now,
        updatedAt: now,
      };
      const ref = await db.collection(SPECIES_COLLECTION).add(doc);
      res.status(201).json({ success: true, data: { id: ref.id, ...doc } });
    } catch (error) {
      console.error('POST /api/app-config/species error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to create species' });
    }
  });

  router.patch('/species/:id', async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
      const { id } = req.params;
      const ref = db.collection(SPECIES_COLLECTION).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ success: false, error: 'Species not found' });
      const updates = { updatedAt: new Date().toISOString() };
      if (req.body.name !== undefined) {
        const name = String(req.body.name || '').trim();
        if (!name) return res.status(400).json({ success: false, error: 'name cannot be empty' });
        updates.name = name;
      }
      if (req.body.scientificName !== undefined) updates.scientificName = String(req.body.scientificName || '').trim();
      if (req.body.taxa !== undefined) {
        const taxa = String(req.body.taxa || '').trim();
        if (!['Aves', 'Mammals', 'Reptiles'].includes(taxa)) {
          return res.status(400).json({ success: false, error: 'taxa must be Aves, Mammals, or Reptiles' });
        }
        updates.taxa = taxa;
      }
      if (req.body.profile !== undefined) {
        updates.profile = String(req.body.profile || '').toLowerCase() === 'high' ? 'high' : 'general';
      }
      if (req.body.ageCategories !== undefined) updates.ageCategories = cleanStringList(req.body.ageCategories);
      if (req.body.activities !== undefined) updates.activities = cleanStringList(req.body.activities);
      if (req.body.knownNames !== undefined) updates.knownNames = cleanStringList(req.body.knownNames);
      if (req.body.sortOrder !== undefined) updates.sortOrder = Number(req.body.sortOrder) || 0;
      if (req.body.active !== undefined) updates.active = !!req.body.active;
      if (req.body.iconUrl !== undefined) updates.iconUrl = req.body.iconUrl || null;
      if (req.body.iconPath !== undefined) updates.iconPath = req.body.iconPath || null;
      await ref.update(updates);
      const updated = (await ref.get()).data();
      res.json({ success: true, data: { id, ...updated } });
    } catch (error) {
      console.error('PATCH /api/app-config/species error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to update species' });
    }
  });

  router.delete('/species/:id', async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
      const { id } = req.params;
      const ref = db.collection(SPECIES_COLLECTION).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ success: false, error: 'Species not found' });
      await ref.delete();
      res.json({ success: true, deleted: id });
    } catch (error) {
      console.error('DELETE /api/app-config/species error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to delete species' });
    }
  });

  router.post('/species/:id/icon', upload.single('icon'), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
      if (!req.file) return res.status(400).json({ success: false, error: 'icon file is required' });
      const { id } = req.params;
      const ref = db.collection(SPECIES_COLLECTION).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ success: false, error: 'Species not found' });
      const { iconPath, iconUrl } = await uploadIcon({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname || `${slugify(snap.data().name)}.svg`,
        folder: 'species',
        id,
      });
      await ref.update({ iconPath, iconUrl, updatedAt: new Date().toISOString() });
      const updated = (await ref.get()).data();
      res.json({ success: true, data: { id, ...updated } });
    } catch (error) {
      console.error('POST /api/app-config/species/:id/icon error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to upload icon' });
    }
  });

  router.post('/incidents', async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ success: false, error: 'name is required' });
      const now = new Date().toISOString();
      const existing = await db.collection(INCIDENTS_COLLECTION).orderBy('sortOrder', 'desc').limit(1).get();
      const sortOrder =
        req.body.sortOrder != null
          ? Number(req.body.sortOrder)
          : existing.empty
            ? 0
            : Number(existing.docs[0].data().sortOrder || 0) + 1;
      const doc = {
        name,
        subtypes: cleanStringList(req.body.subtypes),
        iconUrl: req.body.iconUrl || null,
        iconPath: req.body.iconPath || null,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        active: req.body.active !== false,
        createdAt: now,
        updatedAt: now,
      };
      const ref = await db.collection(INCIDENTS_COLLECTION).add(doc);
      res.status(201).json({ success: true, data: { id: ref.id, ...doc } });
    } catch (error) {
      console.error('POST /api/app-config/incidents error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to create incident type' });
    }
  });

  router.patch('/incidents/:id', async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
      const { id } = req.params;
      const ref = db.collection(INCIDENTS_COLLECTION).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ success: false, error: 'Incident type not found' });
      const updates = { updatedAt: new Date().toISOString() };
      if (req.body.name !== undefined) {
        const name = String(req.body.name || '').trim();
        if (!name) return res.status(400).json({ success: false, error: 'name cannot be empty' });
        updates.name = name;
      }
      if (req.body.subtypes !== undefined) updates.subtypes = cleanStringList(req.body.subtypes);
      if (req.body.sortOrder !== undefined) updates.sortOrder = Number(req.body.sortOrder) || 0;
      if (req.body.active !== undefined) updates.active = !!req.body.active;
      if (req.body.iconUrl !== undefined) updates.iconUrl = req.body.iconUrl || null;
      if (req.body.iconPath !== undefined) updates.iconPath = req.body.iconPath || null;
      await ref.update(updates);
      const updated = (await ref.get()).data();
      res.json({ success: true, data: { id, ...updated } });
    } catch (error) {
      console.error('PATCH /api/app-config/incidents error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to update incident type' });
    }
  });

  router.delete('/incidents/:id', async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
      const { id } = req.params;
      const ref = db.collection(INCIDENTS_COLLECTION).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ success: false, error: 'Incident type not found' });
      await ref.delete();
      res.json({ success: true, deleted: id });
    } catch (error) {
      console.error('DELETE /api/app-config/incidents error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to delete incident type' });
    }
  });

  router.post('/incidents/:id/icon', upload.single('icon'), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
      if (!req.file) return res.status(400).json({ success: false, error: 'icon file is required' });
      const { id } = req.params;
      const ref = db.collection(INCIDENTS_COLLECTION).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ success: false, error: 'Incident type not found' });
      const { iconPath, iconUrl } = await uploadIcon({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname || `${slugify(snap.data().name)}.svg`,
        folder: 'incidents',
        id,
      });
      await ref.update({ iconPath, iconUrl, updatedAt: new Date().toISOString() });
      const updated = (await ref.get()).data();
      res.json({ success: true, data: { id, ...updated } });
    } catch (error) {
      console.error('POST /api/app-config/incidents/:id/icon error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to upload icon' });
    }
  });

  router.get('/icon', async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const path = String(req.query.path || '');
      if (!path.startsWith('app-config/')) {
        return res.status(400).json({ success: false, error: 'Invalid icon path' });
      }
      const bucket = getStorage().bucket();
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (!exists) return res.status(404).json({ success: false, error: 'Icon not found' });
      const [meta] = await file.getMetadata();
      res.setHeader('Content-Type', meta.contentType || 'image/svg+xml');
      res.setHeader('Cache-Control', 'private, max-age=300');
      file
        .createReadStream()
        .on('error', (err) => {
          console.error('icon stream error:', err);
          if (!res.headersSent) res.status(500).end();
        })
        .pipe(res);
    } catch (error) {
      console.error('GET /api/app-config/icon error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to load icon' });
    }
  });

  return router;
};
