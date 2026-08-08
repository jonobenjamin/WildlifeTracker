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
  { key: 'home', label: 'Home' },
  { key: 'sightings', label: 'Sightings', countKey: 'sightings' },
  { key: 'incidents', label: 'Incidents', countKey: 'incidents' },
  { key: 'maintenance', label: 'Maintenance', countKey: 'maintenance' },
  { key: 'tracked', label: 'Tracked', countKey: 'tracked' },
];

function withinDateRange(dateStr, dateStart, dateEnd) {
  if (!dateStr) return !(dateStart || dateEnd);
  const d = dayjs(dateStr);
  if (!d.isValid()) return false;
  if (dateStart && d.isBefore(dayjs(dateStart), 'day')) return false;
  if (dateEnd && d.isAfter(dayjs(dateEnd).endOf('day'))) return false;
  return true;
}

function typeCounts(rows, typeField) {
  const counts = {};
  rows.forEach((o) => {
    const t = o[typeField] || o.poaching_type || 'Unknown';
    counts[t] = (counts[t] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function userCounts(rows) {
  const counts = {};
  rows.forEach((o) => {
    const u = (o.user || '').trim() || 'Unknown';
    counts[u] = (counts[u] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function DateRangeFilters({ dateStart, dateEnd, onDateStartChange, onDateEndChange, onClear }) {
  const hasFilter = !!(dateStart || dateEnd);
  return (
    <div className="kpr-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[140px]">
          <label className="block text-[11px] text-portal-text-muted mb-1">Start date</label>
          <input
            type="date"
            className="kpr-input"
            value={dateStart}
            onChange={(e) => onDateStartChange(e.target.value)}
          />
        </div>
        <div className="min-w-[140px]">
          <label className="block text-[11px] text-portal-text-muted mb-1">End date</label>
          <input
            type="date"
            className="kpr-input"
            value={dateEnd}
            onChange={(e) => onDateEndChange(e.target.value)}
          />
        </div>
        {hasFilter && (
          <button type="button" className="text-xs font-semibold text-portal-text-muted hover:text-portal-text pb-2.5" onClick={onClear}>
            Clear dates
          </button>
        )}
        <p className="text-xs text-portal-text-muted ml-auto pb-2.5">
          Filters charts, lists, and tracked data on this page.
        </p>
      </div>
    </div>
  );
}

function UserSubmissionsPie({ rows, title = 'Submissions by user' }) {
  const counts = useMemo(() => userCounts(rows), [rows]);
  const total = rows.length;

  return (
    <section className="kpr-card p-6">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="text-sm text-portal-text-muted">
          Total: <span className="font-semibold text-portal-text">{total}</span>
        </div>
      </div>
      {counts.length === 0 ? (
        <p className="text-sm text-portal-text-muted text-center py-12">No submissions to chart.</p>
      ) : (
        <ChartCanvas
          type="pie"
          height={300}
          data={{
            labels: counts.map(([u]) => u),
            datasets: [
              {
                data: counts.map(([, n]) => n),
                backgroundColor: counts.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
              },
            ],
          }}
          options={{ plugins: { legend: { position: 'bottom' } } }}
        />
      )}
    </section>
  );
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
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

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

  const filteredObservations = useMemo(
    () => observations.filter((o) => withinDateRange(o.timestamp, dateStart, dateEnd)),
    [observations, dateStart, dateEnd]
  );

  const filteredTracking = useMemo(
    () => tracking.filter((t) => withinDateRange(t.startTime || t.timestamp, dateStart, dateEnd)),
    [tracking, dateStart, dateEnd]
  );

  const stats = useMemo(() => {
    const sightings = filteredObservations.filter((o) => (o.category || '').toLowerCase() === 'sighting');
    const incidents = filteredObservations.filter((o) => (o.category || '').toLowerCase() === 'incident');
    const maintenance = filteredObservations.filter((o) => (o.category || '').toLowerCase() === 'maintenance');
    const byDateDesc = (a, b) => dayjs(b.timestamp || 0).valueOf() - dayjs(a.timestamp || 0).valueOf();
    const totalKm = filteredTracking.reduce((sum, t) => sum + (t.distanceMeters || 0), 0) / 1000;
    return {
      sightings: [...sightings].sort(byDateDesc),
      incidents: [...incidents].sort(byDateDesc),
      maintenance: [...maintenance].sort(byDateDesc),
      totalKm,
      totalSubmissions: filteredObservations.length,
    };
  }, [filteredObservations, filteredTracking]);

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
    filteredObservations.forEach((o) => {
      if (!o.timestamp) return;
      const key = dayjs(o.timestamp).format('MMM YY');
      counts[key] = (counts[key] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort(
      (a, b) => dayjs(a[0], 'MMM YY').valueOf() - dayjs(b[0], 'MMM YY').valueOf()
    );
    return sorted.slice(-12);
  }, [filteredObservations]);

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
    filteredObservations.forEach((o) => {
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
    if (tab.key === 'home') return stats.totalSubmissions;
    if (tab.key === 'tracked') return stats.totalKm.toFixed(1);
    return stats[tab.countKey]?.length ?? 0;
  }

  function tabSubLabel(tab) {
    if (tab.key === 'home') return 'Home';
    if (tab.key === 'tracked') return 'Tracked km';
    return tab.label;
  }

  function isTabSelected(tab) {
    if (tab.key === 'home') return activeTab === null;
    return activeTab === tab.key;
  }

  function selectTab(tab) {
    if (tab.key === 'home') setActiveTab(null);
    else setActiveTab(tab.key);
  }

  if (!authorized) return null;

  const dateFilters = (
    <DateRangeFilters
      dateStart={dateStart}
      dateEnd={dateEnd}
      onDateStartChange={setDateStart}
      onDateEndChange={setDateEnd}
      onClear={() => {
        setDateStart('');
        setDateEnd('');
      }}
    />
  );

  return (
    <AppShell title="Reporting">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1">
            {TABS.map((tab) => {
              const selected = isTabSelected(tab);
              return (
                <button
                  key={tab.key}
                  type="button"
                  className="kpr-card p-4 text-center transition ring-offset-2"
                  style={{
                    outline: selected ? '2px solid var(--kpr-green-light)' : 'none',
                    boxShadow: selected ? '0 0 0 1px var(--kpr-green-light)' : undefined,
                  }}
                  onClick={() => selectTab(tab)}
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

        {dateFilters}

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

            <div className="md:col-span-2">
              <UserSubmissionsPie rows={filteredObservations} title="Submissions by user" />
            </div>
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
            <UserSubmissionsPie rows={stats.sightings} title="Sightings by user" />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="kpr-card p-6">
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
              <UserSubmissionsPie rows={stats.incidents} title="Incidents by user" />
            </div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="kpr-card p-6">
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
              <UserSubmissionsPie rows={stats.maintenance} title="Maintenance by user" />
            </div>
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
          <ReportsTrackedSection tracking={filteredTracking} />
        )}
      </div>
    </AppShell>
  );
}
