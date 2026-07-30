export const CATEGORY_STYLE = {
  sighting: { emoji: '🦁', color: '#526b38' },
  incident: { emoji: '🚨', color: '#b42318' },
  maintenance: { emoji: '🔧', color: '#c9a96b' },
  tree: { emoji: '🌳', color: '#2e7d32' },
  camp: { emoji: '🏕️', color: '#4c1918' },
  poi: { emoji: '📍', color: '#43512d' },
  vehicle: { emoji: '🚙', color: '#1d4ed8' },
  patrol: { emoji: '🚶', color: '#7c3aed' },
};

export function divIcon(L, key) {
  const style = CATEGORY_STYLE[key] || { emoji: '📌', color: '#43512d' };
  return L.divIcon({
    html: `<div style="
      width: 28px; height: 28px; border-radius: 50%;
      background: ${style.color}; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.35); border: 2px solid #fff;
    ">${style.emoji}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

export async function fetchGeoJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

// Deterministic color per label (species / tree type / anything else), so newly
// added species always get a stable, distinct-looking color without needing to
// hand-maintain a giant lookup table.
export function colorForLabel(label) {
  const str = String(label || '').toLowerCase().trim();
  if (!str) return '#43512d';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 62%, 40%)`;
}

export function dotIcon(L, color, size = 14) {
  return L.divIcon({
    html: `<div style="
      width: ${size}px; height: ${size}px; border-radius: 50%;
      background: ${color}; border: 2px solid #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.45);
    "></div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

export function recentPinIcon(L) {
  return L.divIcon({
    html: `<div style="
      width: 12px; height: 12px; border-radius: 50%;
      background: #000; border: 2px solid #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.5);
    "></div>`,
    className: '',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -6],
  });
}

let heatPluginPromise = null;
export async function ensureHeatPlugin(L) {
  if (L.heatLayer) return;
  if (!heatPluginPromise) heatPluginPromise = import('leaflet.heat');
  await heatPluginPromise;
}
