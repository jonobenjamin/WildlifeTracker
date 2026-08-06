'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import AppShell from '@/components/AppShell';
import ChartCanvas from '@/components/ChartCanvas';
import ReportsTrackedSection from '@/components/ReportsTrackedSection';
import { useRequireRole } from '@/lib/authContext';
import { apiFetch } from '@/lib/api';

const KPR_GREEN = '#526b38';
const KPR_BURGUNDY = '#4c1918';

const PIE_COLORS = [
  '#526b38',
  '#4c1918',
  '#c9a96b',
  '#1d4ed8',
  '#b42318',
  '#0f766e',
  '#7c3aed',
  '#b45309',
  '#334155',
  '#0891b2',
];

const TABS = [
  { key: 'sightings', label: 'Sightings', countKey: 'sightings' },
  { key: 'incidents', label: 'Incidents', countKey: 'incidents' },
  { key: 'maintenance', label: 'Maintenance', countKey: 'maintenance' },
  { key: 'tracked', label: 'Tracked', countKey: 'tracked' },
];

function typeCounts(rows, typeField) {
  const counts = {};
  rows.forEach((o) => {
    const t = o[typeField] || o.poaching_type || 'Unknown';
    counts[t] = (counts[t] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function ObservationList({ rows, typeField, empty, onRowClick }) {
  return (
    <div className="overflow-auto max-h-80 rounded-portal border border-portal-border">
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
          {rows.map((o) => (
            <tr
              key={o.id}
              className="border-t border-portal-border cursor-pointer hover:bg-portal-surface-muted/70 transition"
              onClick={() => onRowClick(o)}
              title="Open on concession map"
            >
              <td className="px-3 py-2 whitespace-nowrap">
                {o.timestamp ? dayjs(o.timestamp).format('DD MMM YYYY HH:mm') : '—'}
              </td>
              <td className="px-3 py-2">
                {o[typeField] || o.poaching_type || o.animal || o.incident_type || o.maintenance_type || '—'}
              </td>
              <td className="px-3 py-2">{o.user || '—'}</td>
              <td className="px-3 py-2 truncate max-w-xs">{o.notes || '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-portal-text-muted">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const { authorized } = useRequireRole(['admin']);
  const router = useRouter();
  const [observations, setObservations] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(null);

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
    const byDateDesc = (a, b) => dayjs(b.timestamp || 0).valueOf() - dayjs(a.timestamp || 0).valueOf();
    const totalKm = tracking.reduce((sum, t) => sum + (t.distanceMeters || 0), 0) / 1000;
    return {
      sightings: [...sightings].sort(byDateDesc),
      incidents: [...incidents].sort(byDateDesc),
      maintenance: [...maintenance].sort(byDateDesc),
      totalKm,
    };
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

  const incidentCounts = useMemo(() => typeCounts(stats.incidents, 'incident_type'), [stats.incidents]);
  const maintenanceCounts = useMemo(() => typeCounts(stats.maintenance, 'maintenance_type'), [stats.maintenance]);

  const monthlyTrend = useMemo(() => {
    const counts = {};
    observations.forEach((o) => {
      if (!o.timestamp) return;
      const key = dayjs(o.timestamp).format('MMM YY');
      counts[key] = (counts[key] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort(
      (a, b) => dayjs(a[0], 'MMM YY').valueOf() - dayjs(b[0], 'MMM YY').valueOf()
    );
    return sorted.slice(-12);
  }, [observations]);

  function openOnMap(o, view) {
    const params = new URLSearchParams({ view });
    if (o.id) params.set('id', o.id);
    if (o.latitude != null && o.longitude != null) {
      params.set('lat', String(o.latitude));
      params.set('lng', String(o.longitude));
    }
    router.push(`/map?${params.toString()}`);
  }

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

  function tabCount(tab) {
    if (tab.key === 'tracked') return stats.totalKm.toFixed(1);
    return stats[tab.countKey]?.length ?? 0;
  }

  function tabSubLabel(tab) {
    if (tab.key === 'tracked') return 'Tracked km';
    return tab.label;
  }

  if (!authorized) return null;

  return (
    <AppShell title="Reporting">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
            {TABS.map((tab) => {
              const selected = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className="kpr-card p-4 text-center transition ring-offset-2"
                  style={{
                    outline: selected ? '2px solid var(--kpr-green-light)' : 'none',
                    boxShadow: selected ? '0 0 0 1px var(--kpr-green-light)' : undefined,
                  }}
                  onClick={() => setActiveTab(selected ? null : tab.key)}
                  aria-pressed={selected}
                >
                  <div className="text-2xl font-bold" style={{ color: 'var(--kpr-green-light)' }}>
                    {tabCount(tab)}
                  </div>
                  <div className="text-xs text-portal-text-muted mt-1">{tabSubLabel(tab)}</div>
                </button>
              );
            })}
          </div>
          <button className="kpr-btn flex-shrink-0" onClick={exportCsv}>
            Export CSV
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-portal-text-muted">Loading report data…</p>
        ) : error ? (
          <p className="text-sm text-portal-danger">{error}</p>
        ) : !activeTab ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
            <p className="text-sm text-portal-text-muted md:col-span-2">
              Click Sightings, Incidents, Maintenance, or Tracked above to expand that report.
            </p>
          </div>
        ) : activeTab === 'sightings' ? (
          <div className="space-y-6">
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
              <h2 className="text-base font-semibold mb-1">All sightings</h2>
              <p className="text-xs text-portal-text-muted mb-4">Click a row to open it on the concession map.</p>
              <ObservationList
                rows={stats.sightings}
                typeField="animal"
                empty="No sightings recorded."
                onRowClick={(o) => openOnMap(o, 'sightings')}
              />
            </section>
          </div>
        ) : activeTab === 'incidents' ? (
          <div className="space-y-6">
            <section className="kpr-card p-6 max-w-xl mx-auto w-full">
              <h2 className="text-base font-semibold mb-4">Incidents by type</h2>
              {incidentCounts.length === 0 ? (
                <p className="text-sm text-portal-text-muted text-center py-12">No incident data to chart.</p>
              ) : (
                <ChartCanvas
                  type="pie"
                  height={300}
                  data={{
                    labels: incidentCounts.map(([t]) => t),
                    datasets: [
                      {
                        data: incidentCounts.map(([, n]) => n),
                        backgroundColor: incidentCounts.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
                      },
                    ],
                  }}
                  options={{ plugins: { legend: { position: 'bottom' } } }}
                />
              )}
            </section>
            <section className="kpr-card p-6">
              <h2 className="text-base font-semibold mb-1">All incidents</h2>
              <p className="text-xs text-portal-text-muted mb-4">Click a row to open it on the concession map.</p>
              <ObservationList
                rows={stats.incidents}
                typeField="incident_type"
                empty="No incidents recorded."
                onRowClick={(o) => openOnMap(o, 'incidents')}
              />
            </section>
          </div>
        ) : activeTab === 'maintenance' ? (
          <div className="space-y-6">
            <section className="kpr-card p-6 max-w-xl mx-auto w-full">
              <h2 className="text-base font-semibold mb-4">Maintenance by type</h2>
              {maintenanceCounts.length === 0 ? (
                <p className="text-sm text-portal-text-muted text-center py-12">No maintenance data to chart.</p>
              ) : (
                <ChartCanvas
                  type="pie"
                  height={300}
                  data={{
                    labels: maintenanceCounts.map(([t]) => t),
                    datasets: [
                      {
                        data: maintenanceCounts.map(([, n]) => n),
                        backgroundColor: maintenanceCounts.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
                      },
                    ],
                  }}
                  options={{ plugins: { legend: { position: 'bottom' } } }}
                />
              )}
            </section>
            <section className="kpr-card p-6">
              <h2 className="text-base font-semibold mb-1">All maintenance</h2>
              <p className="text-xs text-portal-text-muted mb-4">Click a row to open it on the concession map.</p>
              <ObservationList
                rows={stats.maintenance}
                typeField="maintenance_type"
                empty="No maintenance recorded."
                onRowClick={(o) => openOnMap(o, 'maintenance')}
              />
            </section>
          </div>
        ) : (
          <ReportsTrackedSection tracking={tracking} />
        )}
      </div>
    </AppShell>
  );
}
