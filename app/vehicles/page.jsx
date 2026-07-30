'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { useRequireRole } from '@/lib/authContext';
import { apiFetch } from '@/lib/api';

export default function VehicleTrackerPage() {
  const { authorized } = useRequireRole(['admin']);
  const [tracking, setTracking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authorized) return;
    (async () => {
      try {
        const res = await apiFetch('/api/tracking');
        setTracking((res.data || []).filter((t) => (t.trackingType || '').toLowerCase() === 'vehicle'));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [authorized]);

  const byVehicle = useMemo(() => {
    const groups = {};
    tracking.forEach((trip) => {
      const v = (trip.vehicle || 'Unknown').trim() || 'Unknown';
      if (!groups[v]) groups[v] = { vehicle: v, trips: 0, totalKm: 0, totalTimeSeconds: 0, byDriver: {} };
      groups[v].trips += 1;
      groups[v].totalKm += (trip.distanceMeters || 0) / 1000;
      groups[v].totalTimeSeconds += trip.totalTimeSeconds || 0;
      const driver = trip.user || 'Unknown';
      groups[v].byDriver[driver] = (groups[v].byDriver[driver] || 0) + (trip.distanceMeters || 0) / 1000;
    });
    return Object.values(groups).sort((a, b) => b.totalKm - a.totalKm);
  }, [tracking]);

  function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  if (!authorized) return null;

  return (
    <AppShell title="Vehicle Tracker">
      <section className="kpr-card p-6">
        <h2 className="text-base font-semibold mb-4">Vehicle usage</h2>
        {loading ? (
          <p className="text-sm text-portal-text-muted">Loading…</p>
        ) : error ? (
          <p className="text-sm text-portal-danger">{error}</p>
        ) : (
          <div className="overflow-auto rounded-portal border border-portal-border">
            <table className="w-full text-sm">
              <thead className="bg-portal-surface-muted">
                <tr>
                  <th className="text-left px-3 py-2.5">Vehicle</th>
                  <th className="text-left px-3 py-2.5">Trips</th>
                  <th className="text-left px-3 py-2.5">Total distance</th>
                  <th className="text-left px-3 py-2.5">Total time</th>
                  <th className="text-left px-3 py-2.5">Drivers</th>
                </tr>
              </thead>
              <tbody>
                {byVehicle.map((row) => (
                  <tr key={row.vehicle} className="border-t border-portal-border align-top">
                    <td className="px-3 py-2.5 font-medium">{row.vehicle}</td>
                    <td className="px-3 py-2.5">{row.trips}</td>
                    <td className="px-3 py-2.5 font-semibold" style={{ color: '#1d4ed8' }}>
                      {row.totalKm.toFixed(1)} km
                    </td>
                    <td className="px-3 py-2.5">{formatDuration(row.totalTimeSeconds)}</td>
                    <td className="px-3 py-2.5 text-portal-text-muted">
                      {Object.entries(row.byDriver)
                        .sort((a, b) => b[1] - a[1])
                        .map(([driver, km]) => `${driver} (${km.toFixed(1)}km)`)
                        .join(', ')}
                    </td>
                  </tr>
                ))}
                {byVehicle.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-portal-text-muted">
                      No vehicle tracking data for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
