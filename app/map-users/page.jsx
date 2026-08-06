'use client';

import { useCallback, useRef, useState } from 'react';
import dayjs from 'dayjs';
import AppShell from '@/components/AppShell';
import LeafletMap from '@/components/LeafletMap';
import { useRequireRole } from '@/lib/authContext';
import { apiFetch } from '@/lib/api';
import { divIcon, fetchGeoJson, lodgeIcon } from '@/lib/mapIcons';

export default function WildlifeMapPage() {
  const { authorized } = useRequireRole(['admin', 'user', 'viewer']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [count, setCount] = useState(0);
  const initialized = useRef(false);

  const handleReady = useCallback(async (map, L) => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const [boundary, camps, obsRes] = await Promise.all([
        fetchGeoJson('/data/geojson/Consession_boundary.geojson'),
        fetchGeoJson('/data/geojson/Camps.geojson'),
        apiFetch('/api/observations').catch(() => ({ data: [] })),
      ]);

      const boundaryLayer = L.geoJSON(boundary, { style: { color: '#4c1918', weight: 2.5, fillOpacity: 0.03 } }).addTo(map);
      map.fitBounds(boundaryLayer.getBounds(), { padding: [20, 20] });

      L.geoJSON(camps, {
        pointToLayer: (feature, latlng) => L.marker(latlng, { icon: lodgeIcon(L) }),
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.Camps || feature.properties?.name || 'Camp';
          layer.bindPopup(`<strong>${escapeHtml(name)}</strong>`);
        },
      }).addTo(map);

      const sightings = (obsRes.data || []).filter((o) => (o.category || '').toLowerCase() === 'sighting' && o.latitude != null && o.longitude != null);
      setCount(sightings.length);
      sightings.forEach((o) => {
        const marker = L.marker([o.latitude, o.longitude], { icon: divIcon(L, 'sighting') });
        marker.bindPopup(
          [
            `<strong>${escapeHtml(o.animal || 'Sighting')}</strong>`,
            o.activity ? `Activity: ${escapeHtml(o.activity)}` : null,
            o.age ? `Age: ${escapeHtml(o.age)}` : null,
            o.timestamp ? dayjs(o.timestamp).format('DD MMM YYYY HH:mm') : null,
          ]
            .filter(Boolean)
            .join('<br>')
        );
        marker.addTo(map);
      });

      setLoading(false);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }, []);

  if (!authorized) return null;

  return (
    <AppShell title="Wildlife Map">
      <div className="relative h-[calc(100vh-160px)] rounded-portal-lg overflow-hidden border border-portal-border">
        <LeafletMap onReady={handleReady} />
        <div className="absolute top-3 left-3 z-[500] kpr-card px-3.5 py-2 text-sm font-medium">
          {loading ? 'Loading sightings…' : `${count} sightings shown`}
        </div>
        {error && <div className="absolute bottom-3 left-3 z-[500] kpr-card px-3.5 py-2 text-xs text-portal-danger">{error}</div>}
      </div>
    </AppShell>
  );
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
