'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import AppShell from '@/components/AppShell';
import LeafletMap from '@/components/LeafletMap';
import MapLegend from '@/components/MapLegend';
import { useRequireRole } from '@/lib/authContext';
import { apiFetch } from '@/lib/api';
import { divIcon, fetchGeoJson } from '@/lib/mapIcons';

const LEGEND_ITEMS = [
  { key: 'roads', label: 'Roads', emoji: '🛣️' },
  { key: 'camps', label: 'Camps', emoji: '🏕️' },
  { key: 'poi', label: 'Points of interest', emoji: '📍' },
  { key: 'trees', label: 'Wrapped trees', emoji: '🌳' },
  { key: 'sighting', label: 'Sightings', emoji: '🦁' },
  { key: 'incident', label: 'Incidents', emoji: '🚨' },
  { key: 'maintenance', label: 'Maintenance', emoji: '🔧' },
];

export default function ConcessionMapPage() {
  const { authorized } = useRequireRole(['admin']);
  const mapObj = useRef({ map: null, L: null, layers: {} });
  const [toggles, setToggles] = useState({
    roads: false,
    camps: true,
    poi: false,
    trees: true,
    sighting: true,
    incident: true,
    maintenance: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const applyVisibility = useCallback(() => {
    const { map, layers } = mapObj.current;
    if (!map) return;
    Object.entries(layers).forEach(([key, layer]) => {
      if (!layer) return;
      const shouldShow = toggles[key];
      const has = map.hasLayer(layer);
      if (shouldShow && !has) map.addLayer(layer);
      if (!shouldShow && has) map.removeLayer(layer);
    });
  }, [toggles]);

  useEffect(() => {
    applyVisibility();
  }, [toggles, applyVisibility]);

  const handleReady = useCallback(async (map, L) => {
    mapObj.current.map = map;
    mapObj.current.L = L;
    try {
      const [boundary, roads, camps, poi] = await Promise.all([
        fetchGeoJson('/data/geojson/Consession_boundary.geojson'),
        fetchGeoJson('/data/geojson/KPR_roads.geojson'),
        fetchGeoJson('/data/geojson/Camps.geojson'),
        fetchGeoJson('/data/geojson/KPR_POI.geojson').catch(() => null),
      ]);

      const boundaryLayer = L.geoJSON(boundary, {
        style: { color: '#4c1918', weight: 2.5, fillOpacity: 0.03 },
      }).addTo(map);
      map.fitBounds(boundaryLayer.getBounds(), { padding: [20, 20] });

      mapObj.current.layers.roads = L.geoJSON(roads, {
        style: { color: '#8a6d3b', weight: 1.5, opacity: 0.8 },
      });

      mapObj.current.layers.camps = L.geoJSON(camps, {
        pointToLayer: (feature, latlng) => L.marker(latlng, { icon: divIcon(L, 'camp') }),
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.Camps || feature.properties?.name || 'Camp';
          layer.bindPopup(`<strong>${escapeHtml(name)}</strong>`);
        },
      });

      if (poi) {
        mapObj.current.layers.poi = L.geoJSON(poi, {
          pointToLayer: (feature, latlng) => L.marker(latlng, { icon: divIcon(L, 'poi') }),
          onEachFeature: (feature, layer) => {
            const name = feature.properties?.name || feature.properties?.['what it is'] || 'Point of interest';
            layer.bindPopup(`<strong>${escapeHtml(name)}</strong>`);
          },
        });
      }

      applyVisibility();

      const [treesRes, obsRes] = await Promise.all([
        apiFetch('/api/trees').catch(() => ({ data: [] })),
        apiFetch('/api/observations').catch(() => ({ data: [] })),
      ]);

      const treeMarkers = (treesRes.data || [])
        .filter((t) => t.latitude != null && t.longitude != null)
        .map((t) => {
          const marker = L.marker([t.latitude, t.longitude], { icon: divIcon(L, 'tree') });
          const status = t.wrappedHistory?.length ? t.wrappedHistory[t.wrappedHistory.length - 1].status : 'Unknown';
          marker.bindPopup(
            `<strong>${escapeHtml(t.species || 'Tree')}</strong><br>Status: ${escapeHtml(status)}<br>DBH readings: ${
              t.dbhHistory?.length || 0
            }`
          );
          return marker;
        });
      mapObj.current.layers.trees = L.layerGroup(treeMarkers);

      ['sighting', 'incident', 'maintenance'].forEach((category) => {
        const markers = (obsRes.data || [])
          .filter((o) => (o.category || '').toLowerCase() === category && o.latitude != null && o.longitude != null)
          .map((o) => {
            const marker = L.marker([o.latitude, o.longitude], { icon: divIcon(L, category) });
            marker.bindPopup(popupHtml(o));
            return marker;
          });
        mapObj.current.layers[category] = L.layerGroup(markers);
      });

      applyVisibility();
      setLoading(false);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authorized) return null;

  return (
    <AppShell title="Concession Map">
      <div className="relative h-[calc(100vh-160px)] rounded-portal-lg overflow-hidden border border-portal-border">
        <LeafletMap onReady={handleReady} />
        <MapLegend items={LEGEND_ITEMS.map((i) => ({ ...i, checked: toggles[i.key] }))} onToggle={(k) => setToggles((t) => ({ ...t, [k]: !t[k] }))} />
        {loading && (
          <div className="absolute bottom-3 left-3 z-[500] kpr-card px-3.5 py-2 text-xs text-portal-text-muted">Loading layers…</div>
        )}
        {error && <div className="absolute bottom-3 left-3 z-[500] kpr-card px-3.5 py-2 text-xs text-portal-danger">{error}</div>}
      </div>
    </AppShell>
  );
}

function popupHtml(o) {
  const lines = [`<strong class="capitalize">${escapeHtml(o.category)}</strong>`];
  if (o.animal) lines.push(`Animal: ${escapeHtml(o.animal)}`);
  if (o.incident_type) lines.push(`Type: ${escapeHtml(o.incident_type)}`);
  if (o.maintenance_type) lines.push(`Type: ${escapeHtml(o.maintenance_type)}`);
  if (o.user) lines.push(`By: ${escapeHtml(o.user)}`);
  if (o.timestamp) lines.push(dayjs(o.timestamp).format('DD MMM YYYY HH:mm'));
  return lines.join('<br>');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
