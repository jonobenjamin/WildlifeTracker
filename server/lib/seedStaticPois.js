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
  if (bundledGeojson) return bundledGeojson;
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

/**
 * One-time seed of KPR_POI.geojson into Firestore `pois`.
 * Uses poi_seed_meta/kpr_geojson so admin edits are never overwritten.
 */
async function ensureStaticPoisSeeded(db) {
  if (!db) return { seeded: false, count: 0 };
  const metaRef = db.collection('poi_seed_meta').doc('kpr_geojson');
  const meta = await metaRef.get();
  if (meta.exists) return { seeded: false, count: meta.data()?.count || 0 };

  const geo = loadKprPoiGeojson();
  const features = Array.isArray(geo?.features) ? geo.features : [];
  if (!features.length) {
    console.warn('POI catalogue seed skipped: KPR_POI.geojson not found');
    return { seeded: false, count: 0 };
  }

  const now = new Date().toISOString();
  await db.runTransaction(async (t) => {
    const again = await t.get(metaRef);
    if (again.exists) return;
    features.forEach((feature, i) => {
      const geom = feature?.geometry;
      if (!geom || geom.type !== 'Point' || !Array.isArray(geom.coordinates)) return;
      const lng = Number(geom.coordinates[0]);
      const lat = Number(geom.coordinates[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const id = `static_poi_${i}`;
      const props = feature.properties || {};
      t.set(db.collection('pois').doc(id), {
        name: poiNameFromProps(props),
        notes: poiNotesFromProps(props),
        latitude: lat,
        longitude: lng,
        source: 'static',
        createdByUid: null,
        localId: id,
        user: 'KPR catalogue',
        createdAt: now,
        updatedAt: now,
      });
    });
    t.set(metaRef, {
      seededAt: now,
      count: features.length,
      source: 'KPR_POI.geojson',
    });
  });
  return { seeded: true, count: features.length };
}

module.exports = { ensureStaticPoisSeeded, loadKprPoiGeojson };
