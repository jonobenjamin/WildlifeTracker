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
