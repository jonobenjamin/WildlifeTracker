'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { useRequireRole, useAuth } from '@/lib/authContext';
import { apiFetch } from '@/lib/api';
import dayjs from 'dayjs';

export default function ProfilePage() {
  const { authorized } = useRequireRole(['admin', 'user', 'viewer']);
  const { user, profile, role } = useAuth();

  const [loading, setLoading] = useState(true);
  const [observations, setObservations] = useState([]);
  const [error, setError] = useState(null);

  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  const displayName = profile?.name || user?.displayName || '';
  const displayContact = profile?.email || user?.email || profile?.phone || user?.phoneNumber || '';

  useEffect(() => {
    if (!authorized) return;
    (async () => {
      try {
        const res = await apiFetch('/api/observations');
        setObservations(res.data || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [authorized]);

  const mine = useMemo(() => {
    const labels = [displayName, displayContact, profile?.phone, user?.phoneNumber]
      .map((v) => (v || '').toLowerCase().trim())
      .filter(Boolean);
    if (!labels.length) return [];
    return observations.filter((o) => {
      const ou = (o.user || '').toLowerCase().trim();
      if (!ou) return false;
      return labels.some((label) => ou.includes(label) || label.includes(ou));
    });
  }, [observations, displayName, displayContact, profile?.phone, user?.phoneNumber]);

  const stats = useMemo(() => {
    const sightings = mine.filter((o) => (o.category || '').toLowerCase() === 'sighting').length;
    const maintenance = mine.filter((o) => (o.category || '').toLowerCase() === 'maintenance').length;
    const incidents = mine.filter((o) => (o.category || '').toLowerCase() === 'incident').length;
    return { sightings, maintenance, incidents, total: mine.length };
  }, [mine]);

  async function handlePasswordChange(e) {
    e.preventDefault();
    setPwdMsg(null);
    if (newPwd.length < 6) {
      setPwdMsg({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    setPwdBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: newPwd, confirmPassword: confirmPwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update password');
      setPwdMsg({ type: 'success', text: 'Password updated successfully' });
      setNewPwd('');
      setConfirmPwd('');
    } catch (err) {
      setPwdMsg({ type: 'error', text: err.message });
    } finally {
      setPwdBusy(false);
    }
  }

  if (!authorized) return null;

  return (
    <AppShell title="Profile">
      <div className="max-w-4xl space-y-6">
        <section className="kpr-card p-6">
          <h2 className="text-base font-semibold mb-4">Account</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-portal-text-muted">Name</dt>
              <dd className="font-medium">{displayName || '—'}</dd>
            </div>
            <div>
              <dt className="text-portal-text-muted">Email / phone</dt>
              <dd className="font-medium">{displayContact || '—'}</dd>
            </div>
            <div>
              <dt className="text-portal-text-muted">Role</dt>
              <dd className="font-medium capitalize">{role || profile?.role || '—'}</dd>
            </div>
            <div>
              <dt className="text-portal-text-muted">Status</dt>
              <dd className="font-medium capitalize">{profile?.status || 'active'}</dd>
            </div>
          </dl>
        </section>

        <section className="kpr-card p-6">
          <h2 className="text-base font-semibold mb-4">Your submissions</h2>
          {loading ? (
            <p className="text-sm text-portal-text-muted">Loading your activity…</p>
          ) : error ? (
            <p className="text-sm text-portal-danger">{error}</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-3 mb-5">
                {[
                  ['Sightings', stats.sightings],
                  ['Maintenance', stats.maintenance],
                  ['Incidents', stats.incidents],
                  ['Total logged', stats.total],
                ].map(([label, n]) => (
                  <div key={label} className="rounded-portal bg-portal-surface-muted border border-portal-border p-4 text-center">
                    <div className="text-2xl font-bold" style={{ color: 'var(--kpr-green-light)' }}>
                      {n}
                    </div>
                    <div className="text-xs text-portal-text-muted mt-1">{label}</div>
                  </div>
                ))}
              </div>
              <div className="overflow-auto max-h-80 rounded-portal border border-portal-border">
                <table className="w-full text-sm">
                  <thead className="bg-portal-surface-muted sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Category</th>
                      <th className="text-left px-3 py-2">Animal / type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.slice(0, 50).map((o) => (
                      <tr key={o.id} className="border-t border-portal-border">
                        <td className="px-3 py-2">{o.timestamp ? dayjs(o.timestamp).format('DD MMM YYYY HH:mm') : '—'}</td>
                        <td className="px-3 py-2 capitalize">{o.category || '—'}</td>
                        <td className="px-3 py-2">{o.animal || o.incident_type || o.maintenance_type || '—'}</td>
                      </tr>
                    ))}
                    {mine.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-portal-text-muted">
                          No submissions yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="kpr-card p-6">
          <h2 className="text-base font-semibold mb-4">Change password</h2>
          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-sm">
            <div>
              <label className="kpr-label">New password</label>
              <input
                type="password"
                className="kpr-input"
                minLength={6}
                required
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
              />
            </div>
            <div>
              <label className="kpr-label">Confirm password</label>
              <input
                type="password"
                className="kpr-input"
                minLength={6}
                required
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
              />
            </div>
            <button type="submit" className="kpr-btn" disabled={pwdBusy}>
              {pwdBusy ? 'Updating...' : 'Update password'}
            </button>
            {pwdMsg && (
              <p className={`text-sm ${pwdMsg.type === 'error' ? 'text-portal-danger' : 'text-green-700'}`}>{pwdMsg.text}</p>
            )}
          </form>
        </section>
      </div>
    </AppShell>
  );
}
