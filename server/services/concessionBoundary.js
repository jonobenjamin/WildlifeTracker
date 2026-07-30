const fs = require('fs');
const path = require('path');

const cache = {};

function loadPolygonFile(filename) {
  if (cache[filename]) return cache[filename];

  const filePath = path.join(process.cwd(), 'public', 'data', 'geojson', filename);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const feature = raw.features?.[0] || (raw.type === 'Feature' ? raw : null);
  if (!feature?.geometry) throw new Error(`${filename} missing geometry`);

  const rings = [];
  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    if (geom.coordinates?.[0]) rings.push(geom.coordinates[0]);
  } else if (geom.type === 'MultiPolygon') {
    geom.coordinates.forEach((poly) => {
      if (poly?.[0]) rings.push(poly[0]);
    });
  } else {
    throw new Error(`Unsupported geometry type in ${filename}: ${geom.type}`);
  }

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  rings.forEach((ring) => {
    ring.forEach(([lon, lat]) => {
      // Guard against projected (UTM) coordinates being loaded by mistake
      if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
        throw new Error(
          `${filename} looks projected (lon=${lon}, lat=${lat}). Use WGS84 lon/lat GeoJSON.`
        );
      }
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    });
  });

  cache[filename] = { rings, minLon, minLat, maxLon, maxLat, filename };
  return cache[filename];
}

function loadConcession() {
  return loadPolygonFile('Consession_boundary.geojson');
}

/** Fire search / alert AOI — wider Okavango Delta polygon (WGS84). */
function loadFireArea() {
  return loadPolygonFile('Oka_Delta.geojson');
}

/** Ray-casting point-in-ring test. Ring is [[lon,lat], ...]. */
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInLoaded(lat, lon, loaded) {
  const { rings, minLon, minLat, maxLon, maxLat } = loaded;
  if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) return false;
  return rings.some((ring) => pointInRing(lon, lat, ring));
}

/** True if the point is inside the KPR concession boundary polygon. */
function pointInConcession(lat, lon) {
  return pointInLoaded(Number(lat), Number(lon), loadConcession());
}

/** True if the point is inside the Okavango Delta polygon only. */
function pointInOkaDelta(lat, lon) {
  return pointInLoaded(Number(lat), Number(lon), loadFireArea());
}

/**
 * Fire AOI = Okavango Delta ∪ KPR concession.
 * Oka_Delta alone does not fully cover the eastern concession fringe.
 */
function pointInFireArea(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  return pointInOkaDelta(la, lo) || pointInConcession(la, lo);
}

function unionBbox(a, b, padding = 0.05) {
  const minLon = Math.min(a.minLon, b.minLon);
  const minLat = Math.min(a.minLat, b.minLat);
  const maxLon = Math.max(a.maxLon, b.maxLon);
  const maxLat = Math.max(a.maxLat, b.maxLat);
  const west = (minLon - padding).toFixed(4);
  const south = (minLat - padding).toFixed(4);
  const east = (maxLon + padding).toFixed(4);
  const north = (maxLat + padding).toFixed(4);
  return `${west},${south},${east},${north}`;
}

/** FIRMS area API bbox covering Oka_Delta + concession. */
function getFireFirmsBbox(padding = 0.05) {
  return unionBbox(loadFireArea(), loadConcession(), padding);
}

/** @deprecated use getFireFirmsBbox — kept for older callers */
function getConcessionFirmsBbox(padding = 0.02) {
  return getFireFirmsBbox(padding);
}

function fireCoords(feature) {
  const props = feature?.properties || {};
  let lon = feature?.geometry?.coordinates?.[0];
  let lat = feature?.geometry?.coordinates?.[1];
  if (lat == null || lon == null) {
    lat = parseFloat(props.latitude);
    lon = parseFloat(props.longitude);
  }
  return { lat: Number(lat), lon: Number(lon) };
}

/** Keep only GeoJSON fire features inside the Okavango Delta AOI. */
function filterFiresInFireArea(features) {
  return (features || []).filter((f) => {
    const { lat, lon } = fireCoords(f);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
    return pointInFireArea(lat, lon);
  });
}

/** Alias — map/API historically named this "concession". */
function filterFiresInConcession(features) {
  return filterFiresInFireArea(features);
}

module.exports = {
  pointInConcession,
  pointInOkaDelta,
  pointInFireArea,
  getFireFirmsBbox,
  getConcessionFirmsBbox,
  filterFiresInFireArea,
  filterFiresInConcession,
  fireCoords,
};
