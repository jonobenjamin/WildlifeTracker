import { apiFetch } from '@/lib/api';
import { fetchGeoJson } from '@/lib/mapIcons';

/**
 * Same data model as the field phone app:
 * - Base network from KPR_roads.geojson (bundled / public)
 * - Drawn / edited roads from Firestore via /api/roads
 *
 * API docs overlay GeoJSON by id (static_0 …). Tombstoned base ids are omitted.
 */
function coordsFromFeature(feature) {
  const geom = feature?.geometry;
  if (!geom || !Array.isArray(geom.coordinates)) return null;
  let line = null;
  if (geom.type === 'MultiLineString') line = geom.coordinates[0];
  else if (geom.type === 'LineString') line = geom.coordinates;
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

export async function loadRoadsDataset() {
  const [geo, apiRes] = await Promise.all([
    fetchGeoJson('/data/geojson/KPR_roads.geojson'),
    apiFetch('/api/roads').catch(() => ({ data: [], hiddenStaticIds: [] })),
  ]);

  const byId = new Map();
  const features = Array.isArray(geo?.features) ? geo.features : [];

  features.forEach((feature, idx) => {
    const coordinates = coordsFromFeature(feature);
    if (!coordinates) return;
    const rawName = feature.properties?.Roads || feature.properties?.name;
    const name = (rawName && String(rawName).trim()) || `Road segment ${idx + 1}`;
    const id = `static_${idx}`;
    byId.set(id, {
      id,
      name,
      Roads: name,
      coordinates,
      source: 'static',
      user: null,
      createdAt: null,
      updatedAt: null,
      fromGeojson: true,
    });
  });

  const hidden = new Set(
    Array.isArray(apiRes.hiddenStaticIds) ? apiRes.hiddenStaticIds.map(String) : []
  );
  for (const id of hidden) {
    byId.delete(id);
  }

  for (const road of apiRes.data || []) {
    if (!road?.id) continue;
    if (hidden.has(String(road.id))) continue;
    const coordinates = Array.isArray(road.coordinates) ? road.coordinates : null;
    if (!coordinates || coordinates.length < 2) continue;
    byId.set(road.id, {
      ...road,
      coordinates,
      source: road.source || (String(road.id).startsWith('static_') ? 'static' : 'user'),
      fromGeojson: false,
    });
  }

  const roads = Array.from(byId.values());
  roads.sort((a, b) => {
    const an = String(a.name || a.Roads || '').toLowerCase();
    const bn = String(b.name || b.Roads || '').toLowerCase();
    if (an !== bn) return an.localeCompare(bn);
    const ta = a.updatedAt || a.createdAt || '';
    const tb = b.updatedAt || b.createdAt || '';
    return String(tb).localeCompare(String(ta));
  });

  return {
    roads,
    counts: {
      total: roads.length,
      base: roads.filter((r) => (r.source || '') !== 'user').length,
      user: roads.filter((r) => (r.source || '') === 'user').length,
    },
  };
}
