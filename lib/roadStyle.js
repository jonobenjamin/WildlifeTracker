import dayjs from 'dayjs';

/** Base / mature roads. New user-drawn roads are blue for 7 days, then this. */
export const BASE_ROAD_COLOR = '#8a6d3b';
export const NEW_USER_ROAD_COLOR = '#1565C0';

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

/** Degrees CSS-clockwise from east, flipped so text stays upright. */
export function roadLabelDeg(latlngs) {
  if (!Array.isArray(latlngs) || latlngs.length < 2) return 0;
  const i = Math.max(0, Math.floor(latlngs.length / 2) - 1);
  const a = latlngs[i];
  const b = latlngs[Math.min(i + 1, latlngs.length - 1)];
  const dLat = b[0] - a[0];
  const dLng = b[1] - a[1];
  let deg = (Math.atan2(-dLat, dLng) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return deg;
}

export function roadNameIcon(L, name, latlngs) {
  const deg = roadLabelDeg(latlngs);
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
