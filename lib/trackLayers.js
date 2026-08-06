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

/** Flatten track LineString vertices into heat-map points [lat, lng, intensity]. */
export function trackVerticesAsHeatPoints(tracks) {
  const points = [];
  tracks.forEach((track) => {
    extractLatLngs(track.geoJson).forEach(([lat, lng]) => {
      points.push([lat, lng, 1]);
    });
  });
  return points;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
