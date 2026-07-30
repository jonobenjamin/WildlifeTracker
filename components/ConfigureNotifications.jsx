'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_ITEMS,
  ALL_ITEMS_VALUE,
  labelForCategory,
} from '@/lib/notificationCatalog';
import {
  listNotificationRules,
  createNotificationRule,
  deleteNotificationRule,
  setNotificationRuleEnabled,
} from '@/lib/actions/notificationRules';

export default function ConfigureNotifications({ users = [] }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [category, setCategory] = useState('sighting');
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [allItems, setAllItems] = useState(false);

  const emailUsers = useMemo(
    () =>
      (users || []).filter(
        (u) => u.email && String(u.email).includes('@') && u.status !== 'revoked'
      ),
    [users]
  );

  const itemOptions = NOTIFICATION_ITEMS[category] || [];

  async function refreshRules() {
    setLoading(true);
    setError(null);
    try {
      const res = await listNotificationRules();
      setRules(res.rules || []);
    } catch (e) {
      setError(e.message || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshRules();
  }, []);

  useEffect(() => {
    setSelectedItems([]);
    setAllItems(false);
  }, [category]);

  function toggleItem(item) {
    setAllItems(false);
    setSelectedItems((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  }

  function toggleUser(id) {
    setSelectedUsers((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    );
  }

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const items = allItems ? [ALL_ITEMS_VALUE] : selectedItems;
      await createNotificationRule({
        category,
        items,
        userIds: selectedUsers,
      });
      setSelectedItems([]);
      setSelectedUsers([]);
      setAllItems(false);
      await refreshRules();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this notification rule?')) return;
    setBusy(true);
    try {
      await deleteNotificationRule(id);
      await refreshRules();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(rule) {
    setBusy(true);
    try {
      await setNotificationRuleEnabled(rule.id, !rule.enabled);
      await refreshRules();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  function userLabel(id) {
    const u = users.find((x) => x.id === id);
    if (!u) return id;
    return u.name ? `${u.name} (${u.email})` : u.email || id;
  }

  return (
    <section className="kpr-card p-6">
      <h2 className="text-base font-semibold mb-1">Configure Notifications</h2>
      <p className="text-sm text-portal-text-muted mb-5">
        Choose a submission type, the specific items to watch, and which users receive the email
        (via Resend).
      </p>

      <form onSubmit={handleCreate} className="space-y-5 mb-8 pb-6 border-b border-portal-border">
        <div>
          <label className="kpr-label">Submission type</label>
          <select
            className="kpr-input max-w-xs"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {NOTIFICATION_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="kpr-label">Sub-items</label>
          <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allItems}
              onChange={(e) => {
                setAllItems(e.target.checked);
                if (e.target.checked) setSelectedItems([]);
              }}
            />
            All {labelForCategory(category).toLowerCase()}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-auto rounded-portal border border-portal-border p-3 bg-portal-surface-muted/40">
            {itemOptions.map((item) => (
              <label
                key={item}
                className={`flex items-center gap-2 text-sm cursor-pointer ${
                  allItems ? 'opacity-40 pointer-events-none' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedItems.includes(item)}
                  disabled={allItems}
                  onChange={() => toggleItem(item)}
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="kpr-label">Notify users</label>
          {emailUsers.length === 0 ? (
            <p className="text-sm text-portal-text-muted">
              No active users with an email address. Add users with emails first.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-auto rounded-portal border border-portal-border p-3 bg-portal-surface-muted/40">
              {emailUsers.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                  />
                  <span>
                    {u.name} <span className="text-portal-text-muted">({u.email})</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-portal-danger">{error}</p>}

        <button
          type="submit"
          className="kpr-btn"
          disabled={
            busy ||
            selectedUsers.length === 0 ||
            (!allItems && selectedItems.length === 0)
          }
        >
          {busy ? 'Saving…' : 'Add notification rule'}
        </button>
      </form>

      <h3 className="text-sm font-semibold mb-3">Active rules</h3>
      {loading ? (
        <p className="text-sm text-portal-text-muted">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-portal-text-muted">No notification rules yet.</p>
      ) : (
        <div className="overflow-auto rounded-portal border border-portal-border">
          <table className="w-full text-sm">
            <thead style={{ background: 'linear-gradient(180deg, var(--kpr-green-light), var(--kpr-green))' }}>
              <tr className="text-white">
                <th className="text-left px-3 py-2.5">Type</th>
                <th className="text-left px-3 py-2.5">Items</th>
                <th className="text-left px-3 py-2.5">Users</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-left px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t border-portal-border">
                  <td className="px-3 py-2.5 font-medium">{labelForCategory(rule.category)}</td>
                  <td className="px-3 py-2.5">
                    {rule.items?.includes(ALL_ITEMS_VALUE) || !rule.items?.length
                      ? 'All'
                      : rule.items.join(', ')}
                  </td>
                  <td className="px-3 py-2.5">
                    {(rule.userIds || []).map(userLabel).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`kpr-badge ${
                        rule.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-portal-danger'
                      }`}
                    >
                      {rule.enabled ? 'On' : 'Off'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-xs font-semibold text-amber-700 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => handleToggle(rule)}
                    >
                      {rule.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold text-portal-danger disabled:opacity-50"
                      disabled={busy}
                      onClick={() => handleDelete(rule.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
