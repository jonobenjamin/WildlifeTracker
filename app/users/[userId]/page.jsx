'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import dayjs from 'dayjs';
import AppShell from '@/components/AppShell';
import { useRequireRole } from '@/lib/authContext';
import { apiFetch } from '@/lib/api';
import { listUsers } from '@/lib/actions/adminUsers';

export default function UserReportPage() {
  const { authorized } = useRequireRole(['admin']);
  const params = useParams();
  const userId = decodeURIComponent(params?.userId || '');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [target, setTarget] = useState(null);
  const [observations, setObservations] = useState([]);

  useEffect(() => {
    if (!authorized || !userId) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [usersRes, obsRes] = await Promise.all([
          listUsers(),
          apiFetch('/api/observations').catch(() => ({ data: [] })),
        ]);
        const found = (usersRes.users || []).find((u) => u.id === userId) || null;
        if (!found) throw new Error('User not found');
        setTarget(found);
        setObservations(obsRes.data || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [authorized, userId]);

  const mine = useMemo(() => {
    if (!target) return [];
    const labels = [target.name, target.email, target.phone]
      .map((v) => (v || '').toLowerCase().trim())
      .filter(Boolean);
    if (!labels.length) return [];
    return observations
      .filter((o) => {
        const ou = (o.user || '').toLowerCase().trim();
        if (!ou) return false;
        return labels.some((label) => ou.includes(label) || label.includes(ou));
      })
      .sort((a, b) => dayjs(b.timestamp || 0).valueOf() - dayjs(a.timestamp || 0).valueOf());
  }, [observations, target]);

  const stats = useMemo(() => {
    const sightings = mine.filter((o) => (o.category || '').toLowerCase() === 'sighting').length;
    const maintenance = mine.filter((o) => (o.category || '').toLowerCase() === 'maintenance').length;
    const incidents = mine.filter((o) => (o.category || '').toLowerCase() === 'incident').length;
    return { sightings, maintenance, incidents, total: mine.length };
  }, [mine]);

  if (!authorized) return null;

  return (
    <AppShell title={target ? `${target.name}'s report` : 'User report'}>
      <div className="max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/admin" className="text-sm font-semibold" style={{ color: 'var(--kpr-green)' }}>
            ← Back to Admin
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-portal-text-muted">Loading personal report…</p>
        ) : error ? (
          <p className="text-sm text-portal-danger">{error}</p>
        ) : (
          <>
            <section className="kpr-card p-6">
              <h2 className="text-base font-semibold mb-4">User</h2>
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <dt className="text-portal-text-muted">Name</dt>
                  <dd className="font-medium">{target.name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-portal-text-muted">Email / phone</dt>
                  <dd className="font-medium">{target.email || target.phone || '—'}</dd>
                </div>
                <div>
                  <dt className="text-portal-text-muted">Role</dt>
                  <dd className="font-medium capitalize">{target.role || '—'}</dd>
                </div>
                <div>
                  <dt className="text-portal-text-muted">Status</dt>
                  <dd className="font-medium capitalize">{target.status || '—'}</dd>
                </div>
              </dl>
            </section>

            <section className="kpr-card p-6">
              <h2 className="text-base font-semibold mb-4">Submission summary</h2>
              <div className="grid grid-cols-4 gap-3 mb-5">
                {[
                  ['Sightings', stats.sightings],
                  ['Incidents', stats.incidents],
                  ['Maintenance', stats.maintenance],
                  ['Total', stats.total],
                ].map(([label, n]) => (
                  <div key={label} className="rounded-portal bg-portal-surface-muted border border-portal-border p-4 text-center">
                    <div className="text-2xl font-bold" style={{ color: 'var(--kpr-green-light)' }}>
                      {n}
                    </div>
                    <div className="text-xs text-portal-text-muted mt-1">{label}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-auto max-h-[28rem] rounded-portal border border-portal-border">
                <table className="w-full text-sm">
                  <thead className="bg-portal-surface-muted sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Category</th>
                      <th className="text-left px-3 py-2">Animal / type</th>
                      <th className="text-left px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map((o) => (
                      <tr key={o.id} className="border-t border-portal-border">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {o.timestamp ? dayjs(o.timestamp).format('DD MMM YYYY HH:mm') : '—'}
                        </td>
                        <td className="px-3 py-2 capitalize">{o.category || '—'}</td>
                        <td className="px-3 py-2">{o.animal || o.incident_type || o.maintenance_type || '—'}</td>
                        <td className="px-3 py-2 truncate max-w-xs">{o.notes || '—'}</td>
                      </tr>
                    ))}
                    {mine.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-portal-text-muted">
                          No submissions for this user.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
