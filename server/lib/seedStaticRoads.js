const fs = require('fs');
const path = require('path');

const META_COLLECTION = 'roads_meta';
const META_DOC = 'static_seed';
const BATCH_SIZE = 400;

/**
 * Import KPR_roads.geojson into Firestore `roads` once, with stable ids
 * (`static_0` …). New user GPS roads continue to append via POST /api/roads.
 */
async function ensureStaticRoadsSeeded(db) {
  if (!db) return { seeded: false, reason: 'no-db' };

  const metaRef = db.collection(META_COLLECTION).doc(META_DOC);
  const metaSnap = await metaRef.get();
  if (metaSnap.exists && metaSnap.data()?.complete) {
    return { seeded: false, reason: 'already-seeded', count: metaSnap.data()?.count || 0 };
  }

  // If any static docs already exist (partial prior run), mark complete and skip.
  const existingStatic = await db.collection('roads').where('source', '==', 'static').limit(1).get();
  if (!existingStatic.empty) {
    await metaRef.set({
      complete: true,
      count: null,
      seededAt: new Date().toISOString(),
      note: 'Detected existing static roads; skipped re-import',
    });
    return { seeded: false, reason: 'static-docs-present' };
  }

  const geoPath = path.join(__dirname, '../data/KPR_roads.geojson');
  if (!fs.existsSync(geoPath)) {
    console.warn('ensureStaticRoadsSeeded: GeoJSON not found at', geoPath);
    return { seeded: false, reason: 'missing-geojson' };
  }

  const geo = JSON.parse(fs.readFileSync(geoPath, 'utf8'));
  const features = Array.isArray(geo.features) ? geo.features : [];
  const now = new Date().toISOString();
  let written = 0;

  for (let i = 0; i < features.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const slice = features.slice(i, i + BATCH_SIZE);
    for (let j = 0; j < slice.length; j++) {
      const idx = i + j;
      const feature = slice[j];
      const geom = feature?.geometry;
      if (!geom || !Array.isArray(geom.coordinates)) continue;

      // MultiLineString with a single part (all KPR features) → LineString coords
      let line = null;
      if (geom.type === 'MultiLineString') {
        line = geom.coordinates[0];
      } else if (geom.type === 'LineString') {
        line = geom.coordinates;
      }
      if (!Array.isArray(line) || line.length < 2) continue;

      const coords = [];
      for (const c of line) {
        if (!Array.isArray(c) || c.length < 2) continue;
        const lon = Number(c[0]);
        const lat = Number(c[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        coords.push([lon, lat]);
      }
      if (coords.length < 2) continue;

      const rawName = feature.properties?.Roads || feature.properties?.name;
      const name = (rawName && String(rawName).trim()) || `Road segment ${idx + 1}`;
      const docId = `static_${idx}`;
      const ref = db.collection('roads').doc(docId);
      batch.set(ref, {
        name,
        Roads: name,
        coordinates: JSON.stringify(coords),
        source: 'static',
        staticIndex: idx,
        user: null,
        localId: null,
        createdAt: now,
        updatedAt: now,
      });
      written += 1;
    }
    await batch.commit();
  }

  await metaRef.set({
    complete: true,
    count: written,
    seededAt: now,
    geojson: 'KPR_roads.geojson',
  });

  console.log(`ensureStaticRoadsSeeded: imported ${written} static road segments`);
  return { seeded: true, count: written };
}

module.exports = { ensureStaticRoadsSeeded };
