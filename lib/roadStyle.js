import dayjs from 'dayjs';

/** Base / mature roads. New user-drawn roads are blue for 7 days, then this. */
export const BASE_ROAD_COLOR = '#8a6d3b';
export const NEW_USER_ROAD_COLOR = '#1565C0';
export const ROAD_NAME_MIN_ZOOM = 12;

export function isUserRoad(road) {
  return String(road?.source || '').toLowerCase() === 'user';
}

export function isNewUserRoad(road) {
  if (!isUserRoad(road)) return false;
  const raw = road.createdAt || road.updatedAt;
  if (!raw) return false;
  const d = dayjs(raw);
  if (!d.isValid()) return false;
  return dayjs().diff(d, 'day') < 7;
}

export function roadLineColor(road) {
  if (isNewUserRoad(road)) return NEW_USER_ROAD_COLOR;
  return BASE_ROAD_COLOR;
}

export function roadLineWeight(road) {
  return isNewUserRoad(road) ? 2.5 : 1.5;
}

export function roadMidpoint(latlngs) {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return null;
  return latlngs[Math.floor(latlngs.length / 2)];
}

/**
 * Two chords per linestring: first→middle and middle→last.
 * Each item is { a, b, mid } in [lat, lng].
 */
export function roadLabelHalves(latlngs) {
  if (!Array.isArray(latlngs) || latlngs.length < 2) return [];
  const last = latlngs.length - 1;
  const mid = Math.floor(latlngs.length / 2);
  const out = [];
  const push = (i0, i1) => {
    if (i1 <= i0) return;
    const a = latlngs[i0];
    const b = latlngs[i1];
    if (!a || !b || (a[0] === b[0] && a[1] === b[1])) return;
    out.push({
      a,
      b,
      mid: latlngs[i0 + Math.floor((i1 - i0) / 2)],
    });
  };
  push(0, mid);
  push(mid, last);
  if (!out.length) push(0, last);
  return out;
}

/** Degrees CSS-clockwise from east, flipped so text stays upright. */
export function roadLabelDeg(a, b) {
  if (!a || !b) return 0;
  const dLat = b[0] - a[0];
  const dLng = b[1] - a[1];
  let deg = (Math.atan2(-dLat, dLng) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return deg;
}

/** Font size grows with zoom, then clamps so names stay readable. */
export function roadLabelFontPx(zoom) {
  const z = Number(zoom);
  if (!Number.isFinite(z)) return 11;
  return Math.max(6, Math.min(14, 4 + (z - 11) * 1.6));
}

export function applyRoadLabelZoom(map) {
  if (!map?.getContainer) return;
  const z = map.getZoom();
  map.getContainer().style.setProperty('--kpr-road-label-size', `${roadLabelFontPx(z)}px`);
}

export function roadNameIcon(L, name, a, b) {
  const deg = roadLabelDeg(a, b);
  return L.divIcon({
    className: 'kpr-road-label',
    html: `<div class="kpr-road-label-rot" style="transform: translate(-50%, -50%) rotate(${deg}deg)"><span>${escapeHtml(name)}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}
