'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { useRequireRole } from '@/lib/authContext';
import { apiFetch } from '@/lib/api';
import { listUsers, createUser, updateUser, setUserStatus, deleteUser } from '@/lib/actions/adminUsers';
import dayjs from 'dayjs';

const ROLES = ['admin', 'user', 'viewer'];

export default function AdminPage() {
  const { authorized } = useRequireRole(['admin']);

  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, revoked: 0 });
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, obsRes] = await Promise.all([listUsers(), apiFetch('/api/observations').catch(() => ({ data: [] }))]);
      setUsers(usersRes.users || []);
      setStats(usersRes.stats || { total: 0, active: 0, revoked: 0 });
      setObservations(obsRes.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authorized) refresh();
  }, [authorized]);

  const submissionCounts = useMemo(() => {
    const byCategory = { sighting: 0, incident: 0, maintenance: 0 };
    observations.forEach((o) => {
      if (byCategory[o.category] !== undefined) byCategory[o.category] += 1;
    });
    return byCategory;
  }, [observations]);

  async function handleStatusToggle(u) {
    setBusyId(u.id);
    try {
      await setUserStatus(u.id, u.status === 'revoked' ? 'active' : 'revoked');
      await refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(u) {
    if (!confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
    setBusyId(u.id);
    try {
      await deleteUser(u.id);
      await refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!authorized) return null;

  return (
    <AppShell title="Submissions & Users">
      <div className="space-y-6">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            ['Total users', stats.total],
            ['Active', stats.active],
            ['Revoked', stats.revoked],
            ['Sightings', submissionCounts.sighting],
            ['Incidents', submissionCounts.incident],
            ['Maintenance', submissionCounts.maintenance],
          ].map(([label, n]) => (
            <div key={label} className="kpr-card p-4 text-center">
              <div className="text-2xl font-bold" style={{ color: 'var(--kpr-green-light)' }}>
                {n}
              </div>
              <div className="text-xs text-portal-text-muted mt-1">{label}</div>
            </div>
          ))}
        </div>

        <section className="kpr-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Users</h2>
            <button className="kpr-btn" onClick={() => setCreating(true)}>
              + Add user
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-portal-text-muted">Loading…</p>
          ) : error ? (
            <p className="text-sm text-portal-danger">{error}</p>
          ) : (
            <div className="overflow-auto rounded-portal border border-portal-border">
              <table className="w-full text-sm">
                <thead style={{ background: 'linear-gradient(180deg, var(--kpr-green-light), var(--kpr-green))' }}>
                  <tr className="text-white">
                    <th className="text-left px-3 py-2.5">Name</th>
                    <th className="text-left px-3 py-2.5">Email / phone</th>
                    <th className="text-left px-3 py-2.5">Role</th>
                    <th className="text-left px-3 py-2.5">Status</th>
                    <th className="text-left px-3 py-2.5">Last login</th>
                    <th className="text-left px-3 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-portal-border">
                      <td className="px-3 py-2.5 font-medium">{u.name}</td>
                      <td className="px-3 py-2.5">{u.email || u.phone || '—'}</td>
                      <td className="px-3 py-2.5 capitalize">{u.role}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`kpr-badge ${
                            u.status === 'revoked' ? 'bg-red-100 text-portal-danger' : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-portal-text-muted">{u.lastLogin ? dayjs(u.lastLogin).format('DD MMM YYYY') : '—'}</td>
                      <td className="px-3 py-2.5 space-x-2 whitespace-nowrap">
                        <button className="text-xs font-semibold" style={{ color: 'var(--kpr-green)' }} onClick={() => setEditing(u)}>
                          Edit
                        </button>
                        <button
                          className="text-xs font-semibold text-amber-700 disabled:opacity-50"
                          disabled={busyId === u.id}
                          onClick={() => handleStatusToggle(u)}
                        >
                          {u.status === 'revoked' ? 'Restore' : 'Revoke'}
                        </button>
                        <button
                          className="text-xs font-semibold text-portal-danger disabled:opacity-50"
                          disabled={busyId === u.id}
                          onClick={() => handleDelete(u)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-portal-text-muted">
                        No users yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {editing && (
        <UserModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await updateUser(editing.id, input);
            setEditing(null);
            refresh();
          }}
        />
      )}
      {creating && (
        <UserModal
          onClose={() => setCreating(false)}
          onSave={async (input) => {
            await createUser(input);
            setCreating(false);
            refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function UserModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [role, setRole] = useState(initial?.role || 'user');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (initial) {
        const input = { name, role };
        if (password) input.password = password;
        await onSave(input);
      } else {
        await onSave({ name, email, phone, role, password: password || undefined });
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="kpr-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-4">{initial ? 'Edit user' : 'Add user'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="kpr-label">Name</label>
            <input className="kpr-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          {!initial && (
            <>
              <div>
                <label className="kpr-label">Email</label>
                <input type="email" className="kpr-input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="kpr-label">Phone</label>
                <input className="kpr-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <label className="kpr-label">Role</label>
            <select className="kpr-input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="kpr-label">{initial ? 'Reset password (optional)' : 'Password (optional)'}</label>
            <input
              type="password"
              className="kpr-input"
              placeholder="Leave blank for app-only / PIN login"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-portal-danger">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" className="kpr-btn flex-1" disabled={busy}>
              {busy ? 'Saving...' : 'Save'}
            </button>
            <button type="button" className="kpr-btn-secondary flex-1" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
