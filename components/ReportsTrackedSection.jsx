'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import LeafletMap from '@/components/LeafletMap';
import { fetchGeoJson } from '@/lib/mapIcons';
import { buildTrackLayer, trackColor, trackLabel } from '@/lib/trackLayers';

function formatDuration(seconds) {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function TrackTable({ title, rows, empty, showVehicle }) {
  return (
    <section className="kpr-card p-4 flex-1 min-w-0">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="overflow-auto max-h-72 rounded-portal border border-portal-border">
        <table className="w-full text-sm">
          <thead className="bg-portal-surface-muted sticky top-0">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              {showVehicle && <th className="text-left px-3 py-2">Vehicle</th>}
              <th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Distance</th>
              <th className="text-left px-3 py-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-portal-border">
                <td className="px-3 py-2 whitespace-nowrap">
                  {t.startTime ? dayjs(t.startTime).format('DD MMM YYYY HH:mm') : '—'}
                </td>
                {showVehicle && (
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: trackColor(t) }}
                      />
                      {t.vehicle || '—'}
                    </span>
                  </td>
                )}
                <td className="px-3 py-2">{t.user || '—'}</td>
                <td className="px-3 py-2">
                  {t.distanceMeters != null ? `${(t.distanceMeters / 1000).toFixed(1)} km` : '—'}
                </td>
                <td className="px-3 py-2">{formatDuration(t.totalTimeSeconds)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={showVehicle ? 5 : 4} className="px-3 py-6 text-center text-portal-text-muted">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Tracked km tables + map. Date filtering is handled by the parent reports page. */
export default function ReportsTrackedSection({ tracking }) {
  const [lineMode, setLineMode] = useState('vehicle'); // vehicle | patrol
  const mapObj = useRef({ map: null, L: null, trackLayer: null, boundary: null });

  const patrols = useMemo(
    () => tracking.filter((t) => (t.trackingType || '').toLowerCase() === 'patrol'),
    [tracking]
  );
  const vehicles = useMemo(
    () => tracking.filter((t) => (t.trackingType || '').toLowerCase() === 'vehicle'),
    [tracking]
  );

  const linesToShow = lineMode === 'vehicle' ? vehicles : patrols;

  const vehicleLegend = useMemo(() => {
    const seen = new Map();
    vehicles.forEach((t) => {
      const label = trackLabel(t);
      if (!seen.has(label)) seen.set(label, trackColor(t));
    });
    return Array.from(seen.entries());
  }, [vehicles]);

  const redrawTracks = useCallback(() => {
    const { map, L } = mapObj.current;
    if (!map || !L) return;
    if (mapObj.current.trackLayer) {
      map.removeLayer(mapObj.current.trackLayer);
      mapObj.current.trackLayer = null;
    }
    const { layer, bounds } = buildTrackLayer(L, linesToShow);
    mapObj.current.trackLayer = layer.addTo(map);
    if (bounds) {
      try {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
      } catch {
        /* ignore empty/invalid bounds */
      }
    } else if (mapObj.current.boundary) {
      try {
        map.fitBounds(mapObj.current.boundary.getBounds(), { padding: [20, 20] });
      } catch {
        /* ignore */
      }
    }
  }, [linesToShow]);

  useEffect(() => {
    redrawTracks();
  }, [redrawTracks]);

  const redrawRef = useRef(redrawTracks);
  redrawRef.current = redrawTracks;

  const handleReady = useCallback(async (map, L) => {
    mapObj.current.map = map;
    mapObj.current.L = L;
    try {
      const boundary = await fetchGeoJson('/data/geojson/Consession_boundary.geojson');
      mapObj.current.boundary = L.geoJSON(boundary, {
        style: { color: '#4c1918', weight: 2, fillOpacity: 0.03 },
      }).addTo(map);
      map.fitBounds(mapObj.current.boundary.getBounds(), { padding: [20, 20] });
    } catch {
      /* boundary optional */
    }
    redrawRef.current();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-4">
        <TrackTable title={`Patrol (${patrols.length})`} rows={patrols} empty="No patrol tracks for this filter." />
        <TrackTable
          title={`Vehicles (${vehicles.length})`}
          rows={vehicles}
          empty="No vehicle tracks for this filter."
          showVehicle
        />
      </div>

      <section className="kpr-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Track map</h3>
          <div className="inline-flex rounded-portal border border-portal-border overflow-hidden">
            {[
              ['vehicle', 'Vehicle tracks'],
              ['patrol', 'Patrol tracks'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="px-3 py-1.5 text-xs font-semibold transition"
                style={{
                  background: lineMode === value ? 'var(--kpr-green)' : 'transparent',
                  color: lineMode === value ? '#fff' : 'inherit',
                }}
                onClick={() => setLineMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {lineMode === 'vehicle' && vehicleLegend.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-portal-text-muted">
            {vehicleLegend.map(([label, color]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        )}

        <div className="h-80 rounded-portal overflow-hidden border border-portal-border">
          <LeafletMap onReady={handleReady} />
        </div>
        <p className="text-xs text-portal-text-muted">
          Showing {linesToShow.length} {lineMode} track{linesToShow.length === 1 ? '' : 's'}
          {lineMode === 'vehicle' ? ' (each vehicle number has its own colour)' : ''}.
        </p>
      </section>
    </div>
  );
}
