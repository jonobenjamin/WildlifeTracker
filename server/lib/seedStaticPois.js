const fs = require('fs');
const path = require('path');

// Keep this require so Vercel traces the GeoJSON into the serverless bundle.
let bundledGeojson = null;
try {
  bundledGeojson = require('../data/KPR_POI.geojson');
} catch (_) {
  bundledGeojson = null;
}

function loadKprPoiGeojson() {
  if (bundledGeojson && Array.isArray(bundledGeojson.features)) return bundledGeojson;
  const candidates = [
    path.join(__dirname, '../data/KPR_POI.geojson'),
    path.join(process.cwd(), 'public/data/geojson/KPR_POI.geojson'),
    path.join(process.cwd(), 'WildlifeTracker/public/data/geojson/KPR_POI.geojson'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (_) {
      /* try next */
    }
  }
  return null;
}

function poiNameFromProps(props) {
  const named = String(props?.Name || props?.name || '').trim();
  const kind = String(props?.['what it is'] || '').trim();
  return named || kind || 'Point of interest';
}

function poiNotesFromProps(props) {
  const named = String(props?.Name || props?.name || '').trim();
  const kind = String(props?.['what it is'] || '').trim();
  if (named && kind && named.toLowerCase() !== kind.toLowerCase()) return kind;
  return null;
}

function geojsonFeaturesAsPois() {
  const geo = loadKprPoiGeojson();
  const features = Array.isArray(geo?.features) ? geo.features : [];
  const out = [];
  features.forEach((feature, i) => {
    const geom = feature?.geometry;
    if (!geom || geom.type !== 'Point' || !Array.isArray(geom.coordinates)) return;
    const lng = Number(geom.coordinates[0]);
    const lat = Number(geom.coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const props = feature.properties || {};
    const id = `static_poi_${i}`;
    out.push({
      id,
      name: poiNameFromProps(props),
      notes: poiNotesFromProps(props),
      latitude: lat,
      longitude: lng,
      source: 'static',
      createdByUid: null,
      localId: id,
      user: 'KPR catalogue',
      createdAt: null,
      updatedAt: null,
    });
  });
  return out;
}

async function listHiddenPoiIds(db) {
  if (!db) return [];
  try {
    const snap = await db.collection('poi_tombstones').get();
    return snap.docs.map((d) => d.id);
  } catch (e) {
    console.warn('listHiddenPoiIds:', e.message);
    return [];
  }
}

/**
 * One catalogue: uploaded GeoJSON + Firestore adds/edits.
 * Tombstoned static ids stay hidden. Firestore wins on id overlap.
 */
async function mergePoiCatalogue(db) {
  const byId = new Map();
  const hidden = new Set(await listHiddenPoiIds(db));

  for (const p of geojsonFeaturesAsPois()) {
    if (hidden.has(p.id)) continue;
    byId.set(p.id, p);
  }

  if (db) {
    try {
      const snapshot = await db.collection('pois').get();
      snapshot.forEach((doc) => {
        if (hidden.has(doc.id)) return;
        const data = doc.data() || {};
        const lat = Number(data.latitude);
        const lon = Number(data.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        byId.set(doc.id, {
          id: doc.id,
          ...data,
          latitude: lat,
          longitude: lon,
        });
      });
    } catch (e) {
      console.warn('mergePoiCatalogue firestore:', e.message);
    }
  }

  return Array.from(byId.values());
}

/**
 * Best-effort write of missing static_poi_* docs so edits persist in Firebase.
 * Never overwrites a doc that already exists (admin edits stay).
 */
async function ensureStaticPoisSeeded(db) {
  if (!db) return { seeded: false, count: 0 };
  const geoPois = geojsonFeaturesAsPois();
  if (!geoPois.length) {
    console.warn('POI catalogue seed skipped: KPR_POI.geojson not found');
    return { seeded: false, count: 0 };
  }

  const probe = await db.collection('pois').doc('static_poi_0').get();
  if (probe.exists) return { seeded: false, count: geoPois.length };

  const now = new Date().toISOString();
  const batch = db.batch();
  geoPois.forEach((p) => {
    const { id, ...rest } = p;
    batch.set(
      db.collection('pois').doc(id),
      { ...rest, createdAt: now, updatedAt: now },
      { merge: true }
    );
  });
  await batch.commit();
  return { seeded: true, count: geoPois.length };
}

module.exports = {
  ensureStaticPoisSeeded,
  loadKprPoiGeojson,
  geojsonFeaturesAsPois,
  mergePoiCatalogue,
  listHiddenPoiIds,
};
