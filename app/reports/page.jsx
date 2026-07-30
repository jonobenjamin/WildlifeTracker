'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import AppShell from '@/components/AppShell';
import ChartCanvas from '@/components/ChartCanvas';
import { useRequireRole } from '@/lib/authContext';
import { apiFetch } from '@/lib/api';

const KPR_GREEN = '#526b38';
const KPR_GOLD = '#c9a96b';
const KPR_BURGUNDY = '#4c1918';

export default function ReportsPage() {
  const { authorized } = useRequireRole(['admin']);
  const [observations, setObservations] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authorized) return;
    (async () => {
      try {
        const [obsRes, trackRes] = await Promise.all([
          apiFetch('/api/observations'),
          apiFetch('/api/tracking').catch(() => ({ data: [] })),
        ]);
        setObservations(obsRes.data || []);
        setTracking(trackRes.data || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [authorized]);

  const stats = useMemo(() => {
    const sightings = observations.filter((o) => (o.category || '').toLowerCase() === 'sighting');
    const incidents = observations.filter((o) => (o.category || '').toLowerCase() === 'incident');
    const maintenance = observations.filter((o) => (o.category || '').toLowerCase() === 'maintenance');
    const totalKm = tracking.reduce((sum, t) => sum + (t.distanceMeters || 0), 0) / 1000;
    return { sightings, incidents, maintenance, totalKm };
  }, [observations, tracking]);

  const animalCounts = useMemo(() => {
    const counts = {};
    stats.sightings.forEach((o) => {
      const a = o.animal || 'Unknown';
      counts[a] = (counts[a] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [stats.sightings]);

  const monthlyTrend = useMemo(() => {
    const counts = {};
    observations.forEach((o) => {
      if (!o.timestamp) return;
      const key = dayjs(o.timestamp).format('MMM YY');
      counts[key] = (counts[key] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => dayjs(a[0], 'MMM YY').valueOf() - dayjs(b[0], 'MMM YY').valueOf());
    return sorted.slice(-12);
  }, [observations]);

  function exportCsv() {
    const rows = [['Date', 'Category', 'Animal/Type', 'User', 'Latitude', 'Longitude']];
    observations.forEach((o) => {
      rows.push([
        o.timestamp || '',
        o.category || '',
        o.animal || o.incident_type || o.maintenance_type || '',
        o.user || '',
        o.latitude ?? '',
        o.longitude ?? '',
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kpr-observations-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!authorized) return null;

  return (
    <AppShell title="Reporting">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-4 gap-3 flex-1">
            {[
              ['Sightings', stats.sightings.length],
              ['Incidents', stats.incidents.length],
              ['Maintenance', stats.maintenance.length],
              ['Tracked km', stats.totalKm.toFixed(1)],
            ].map(([label, n]) => (
              <div key={label} className="kpr-card p-4 text-center">
                <div className="text-2xl font-bold" style={{ color: 'var(--kpr-green-light)' }}>
                  {n}
                </div>
                <div className="text-xs text-portal-text-muted mt-1">{label}</div>
              </div>
            ))}
          </div>
          <button className="kpr-btn ml-4" onClick={exportCsv}>
            Export CSV
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-portal-text-muted">Loading report data…</p>
        ) : error ? (
          <p className="text-sm text-portal-danger">{error}</p>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <section className="kpr-card p-6">
              <h2 className="text-base font-semibold mb-4">Top species sighted</h2>
              <ChartCanvas
                type="bar"
                data={{
                  labels: animalCounts.map(([a]) => a),
                  datasets: [{ label: 'Sightings', data: animalCounts.map(([, n]) => n), backgroundColor: KPR_GREEN }],
                }}
                options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
              />
            </section>

            <section className="kpr-card p-6">
              <h2 className="text-base font-semibold mb-4">Submissions trend</h2>
              <ChartCanvas
                type="line"
                data={{
                  labels: monthlyTrend.map(([m]) => m),
                  datasets: [
                    {
                      label: 'Submissions',
                      data: monthlyTrend.map(([, n]) => n),
                      borderColor: KPR_BURGUNDY,
                      backgroundColor: 'rgba(76,25,24,0.08)',
                      fill: true,
                      tension: 0.3,
                    },
                  ],
                }}
                options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
              />
            </section>

            <section className="kpr-card p-6 col-span-2">
              <h2 className="text-base font-semibold mb-4">Recent incidents</h2>
              <div className="overflow-auto max-h-72 rounded-portal border border-portal-border">
                <table className="w-full text-sm">
                  <thead className="bg-portal-surface-muted sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-left px-3 py-2">Reported by</th>
                      <th className="text-left px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.incidents.slice(0, 30).map((o) => (
                      <tr key={o.id} className="border-t border-portal-border">
                        <td className="px-3 py-2">{o.timestamp ? dayjs(o.timestamp).format('DD MMM YYYY HH:mm') : '—'}</td>
                        <td className="px-3 py-2">{o.incident_type || o.poaching_type || '—'}</td>
                        <td className="px-3 py-2">{o.user || '—'}</td>
                        <td className="px-3 py-2 truncate max-w-xs">{o.notes || '—'}</td>
                      </tr>
                    ))}
                    {stats.incidents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-portal-text-muted">
                          No incidents recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
