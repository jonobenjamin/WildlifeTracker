const fs = require('fs');
const path = require('path');

let cached = null;

function loadBoundary() {
  if (cached) return cached;

  const filePath = path.join(process.cwd(), 'public', 'data', 'geojson', 'Consession_boundary.geojson');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const feature = raw.features?.[0];
  if (!feature?.geometry) throw new Error('Concession boundary GeoJSON missing geometry');

  const rings = [];
  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    // exterior ring only
    if (geom.coordinates?.[0]) rings.push(geom.coordinates[0]);
  } else if (geom.type === 'MultiPolygon') {
    geom.coordinates.forEach((poly) => {
      if (poly?.[0]) rings.push(poly[0]);
    });
  } else {
    throw new Error(`Unsupported boundary geometry type: ${geom.type}`);
  }

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  rings.forEach((ring) => {
    ring.forEach(([lon, lat]) => {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    });
  });

  cached = { rings, minLon, minLat, maxLon, maxLat };
  return cached;
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

/**
 * True if the point is inside the KPR concession boundary polygon.
 * Accepts (lat, lon) — matches how FIRMS/Leaflet think about coordinates.
 */
function pointInConcession(lat, lon) {
  const { rings, minLon, minLat, maxLon, maxLat } = loadBoundary();
  if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) return false;
  return rings.some((ring) => pointInRing(lon, lat, ring));
}

/** FIRMS area API bbox string: west,south,east,north — slightly padded around the concession. */
function getConcessionFirmsBbox(padding = 0.02) {
  const { minLon, minLat, maxLon, maxLat } = loadBoundary();
  const west = (minLon - padding).toFixed(4);
  const south = (minLat - padding).toFixed(4);
  const east = (maxLon + padding).toFixed(4);
  const north = (maxLat + padding).toFixed(4);
  return `${west},${south},${east},${north}`;
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

/** Keep only GeoJSON fire features whose point falls inside the concession. */
function filterFiresInConcession(features) {
  return (features || []).filter((f) => {
    const { lat, lon } = fireCoords(f);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
    return pointInConcession(lat, lon);
  });
}

module.exports = {
  pointInConcession,
  getConcessionFirmsBbox,
  filterFiresInConcession,
  fireCoords,
};
