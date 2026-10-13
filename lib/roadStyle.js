import dayjs from 'dayjs';

/** User-drawn roads are blue for 7 days, then black. Base GeoJSON stays brown. */
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
  if (isUserRoad(road)) return isNewUserRoad(road) ? '#1565C0' : '#111111';
  return '#8a6d3b';
}

export function roadLineWeight(road) {
  return isUserRoad(road) ? 2.5 : 1.5;
}

export function roadMidpoint(latlngs) {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return null;
  return latlngs[Math.floor(latlngs.length / 2)];
}

export function roadNameIcon(L, name) {
  return L.divIcon({
    className: 'kpr-road-label',
    html: `<span>${escapeHtml(name)}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 16],
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
