const fs = require('fs');
const path = require('path');

const META_COLLECTION = 'roads_meta';
const META_DOC = 'static_seed';
const BATCH_SIZE = 400;

/**
 * Load KPR roads GeoJSON. Prefer require() so Next/Vercel file tracing
 * bundles the file into the serverless function; fall back to fs paths.
 */
function loadRoadsGeojson() {
  try {
    // Static require — critical for Vercel output file tracing.
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require('../data/KPR_roads.geojson');
  } catch (err) {
    const candidates = [
      path.join(__dirname, '../data/KPR_roads.geojson'),
      path.join(process.cwd(), 'server/data/KPR_roads.geojson'),
      path.join(process.cwd(), 'public/data/geojson/KPR_roads.geojson'),
    ];
    for (const geoPath of candidates) {
      try {
        if (fs.existsSync(geoPath)) {
          return JSON.parse(fs.readFileSync(geoPath, 'utf8'));
        }
      } catch {
        /* try next */
      }
    }
    console.warn(
      'ensureStaticRoadsSeeded: GeoJSON not found',
      err && err.message ? err.message : err
    );
    return null;
  }
}

function featureToCoords(feature) {
  const geom = feature?.geometry;
  if (!geom || !Array.isArray(geom.coordinates)) return null;

  let line = null;
  if (geom.type === 'MultiLineString') {
    line = geom.coordinates[0];
  } else if (geom.type === 'LineString') {
    line = geom.coordinates;
  }
  if (!Array.isArray(line) || line.length < 2) return null;

  const coords = [];
  for (const c of line) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    coords.push([lon, lat]);
  }
  return coords.length >= 2 ? coords : null;
}

/**
 * Import KPR_roads.geojson into Firestore `roads` once, with stable ids
 * (`static_0` …). Idempotent and resumable; new user GPS roads stay separate.
 */
async function ensureStaticRoadsSeeded(db) {
  if (!db) return { seeded: false, reason: 'no-db' };

  const geo = loadRoadsGeojson();
  if (!geo) {
    return { seeded: false, reason: 'missing-geojson' };
  }

  const features = Array.isArray(geo.features) ? geo.features : [];
  const expected = features.length;
  if (expected === 0) {
    return { seeded: false, reason: 'empty-geojson' };
  }

  const metaRef = db.collection(META_COLLECTION).doc(META_DOC);
  const metaSnap = await metaRef.get();
  const meta = metaSnap.exists ? metaSnap.data() || {} : {};

  // If marked complete, verify at least static_0 exists (guards corrupted meta).
  if (meta.complete && meta.count === expected) {
    const probe = await db.collection('roads').doc('static_0').get();
    if (probe.exists) {
      return { seeded: false, reason: 'already-seeded', count: expected };
    }
    console.warn('ensureStaticRoadsSeeded: meta complete but static_0 missing; reseeding');
  }

  let start = 0;
  if (
    typeof meta.nextIndex === 'number' &&
    meta.nextIndex > 0 &&
    meta.nextIndex < expected &&
    !meta.complete
  ) {
    start = meta.nextIndex;
  }

  const now = new Date().toISOString();
  let written = 0;
  let cursor = start;

  for (; cursor < expected; ) {
    const batch = db.batch();
    let batchCount = 0;

    while (cursor < expected && batchCount < BATCH_SIZE) {
      const idx = cursor;
      cursor += 1;
      const feature = features[idx];
      const coords = featureToCoords(feature);
      if (!coords) continue;

      const rawName = feature.properties?.Roads || feature.properties?.name;
      const name = (rawName && String(rawName).trim()) || `Road segment ${idx + 1}`;
      const ref = db.collection('roads').doc(`static_${idx}`);
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
      batchCount += 1;
      written += 1;
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    // Persist progress so a timeout can resume on the next request.
    const done = cursor >= expected;
    await metaRef.set({
      complete: done,
      count: done ? expected : null,
      nextIndex: cursor,
      seededAt: now,
      geojson: 'KPR_roads.geojson',
      expected,
    });

    if (done) break;
  }

  console.log(
    `ensureStaticRoadsSeeded: wrote ${written} segments (index ${start}→${cursor} of ${expected})`
  );
  return {
    seeded: written > 0,
    count: cursor,
    expected,
    complete: cursor >= expected,
    reason: cursor >= expected ? 'seeded' : 'partial',
  };
}

module.exports = { ensureStaticRoadsSeeded, loadRoadsGeojson };
