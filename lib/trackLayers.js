import { colorForLabel } from '@/lib/mapIcons';

/** Extract [lat, lng] pairs from tracking geoJson (Feature / LineString / string). */
export function extractLatLngs(geoJson) {
  if (!geoJson) return [];
  let gj = geoJson;
  if (typeof gj === 'string') {
    try {
      gj = JSON.parse(gj);
    } catch {
      return [];
    }
  }
  const geom = gj.type === 'Feature' ? gj.geometry : gj;
  if (!geom || geom.type !== 'LineString' || !Array.isArray(geom.coordinates)) return [];
  return geom.coordinates
    .filter((c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map(([lng, lat]) => [lat, lng]);
}

export function trackColor(track) {
  const type = (track.trackingType || '').toLowerCase();
  if (type === 'vehicle') return colorForLabel(track.vehicle || track.id || 'vehicle');
  return colorForLabel(track.user || track.id || 'patrol');
}

export function trackLabel(track) {
  const type = (track.trackingType || '').toLowerCase();
  if (type === 'vehicle') return track.vehicle || 'Unknown vehicle';
  return track.user || 'Patrol';
}

/**
 * Build Leaflet polylines for tracking activities.
 * Returns { layer, bounds } where layer is an L.layerGroup.
 */
export function buildTrackLayer(L, tracks, { weight = 3, opacity = 0.85 } = {}) {
  const layers = [];
  const bounds = [];

  tracks.forEach((track) => {
    const latlngs = extractLatLngs(track.geoJson);
    if (latlngs.length < 2) return;
    const color = trackColor(track);
    const line = L.polyline(latlngs, { color, weight, opacity });
    const km = track.distanceMeters != null ? `${(track.distanceMeters / 1000).toFixed(1)} km` : '—';
    const when = track.startTime || track.timestamp || '';
    line.bindPopup(
      `<strong>${escapeHtml(trackLabel(track))}</strong><br>` +
        `Type: ${escapeHtml(track.trackingType || '—')}<br>` +
        `By: ${escapeHtml(track.user || '—')}<br>` +
        `Distance: ${escapeHtml(km)}<br>` +
        `${escapeHtml(when)}`
    );
    layers.push(line);
    latlngs.forEach((ll) => bounds.push(ll));
  });

  return {
    layer: L.layerGroup(layers),
    bounds: bounds.length ? bounds : null,
    count: layers.length,
  };
}

/**
 * Build density heat points for vehicle/patrol tracks.
 *
 * leaflet.heat treats each point's intensity relative to `max`. If every GPS
 * vertex is `[lat,lng,1]` with default max=1, a lone vertex paints as hot as a
 * busy junction. Instead we:
 *  1. Bin vertices into ~80m cells
 *  2. Count unique tracks per cell (one pass through a cell = 1, not N GPS pings)
 *  3. Return intensity = visit count, plus a `max` so colour scales with stacking
 *
 * @returns {{ points: Array<[number, number, number]>, max: number }}
 */
export function trackVerticesAsHeatPoints(tracks, { cellSizeDeg = 0.00075 } = {}) {
  /** @type {Map<string, { lat: number, lng: number, n: number, count: number }>} */
  const cells = new Map();

  tracks.forEach((track) => {
    const latlngs = extractLatLngs(track.geoJson);
    if (!latlngs.length) return;
    const seenInTrack = new Set();

    latlngs.forEach(([lat, lng]) => {
      const key = `${Math.round(lat / cellSizeDeg)}:${Math.round(lng / cellSizeDeg)}`;
      // Same trip only contributes once per cell (avoids dense GPS fake-hotspots).
      if (seenInTrack.has(key)) return;
      seenInTrack.add(key);

      let cell = cells.get(key);
      if (!cell) {
        cell = { lat: 0, lng: 0, n: 0, count: 0 };
        cells.set(key, cell);
      }
      cell.lat += lat;
      cell.lng += lng;
      cell.n += 1;
      cell.count += 1;
    });
  });

  const points = [];
  let maxCount = 0;
  for (const cell of cells.values()) {
    maxCount = Math.max(maxCount, cell.count);
    points.push([cell.lat / cell.n, cell.lng / cell.n, cell.count]);
  }

  // Floor so a single pass never looks like full "hot" when there is little data.
  const max = Math.max(maxCount, 4);
  return { points, max, maxCount };
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
