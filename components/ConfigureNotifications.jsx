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
  getResendStatus,
  sendTestNotificationEmail,
} from '@/lib/actions/notificationRules';

export default function ConfigureNotifications({ users = [] }) {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resendStatus, setResendStatus] = useState(null);
  const [testMsg, setTestMsg] = useState(null);

  const [category, setCategory] = useState('sighting');
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [allItems, setAllItems] = useState(false);
  const [testUserId, setTestUserId] = useState('');

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
      const [rulesRes, status] = await Promise.all([listNotificationRules(), getResendStatus()]);
      if (rulesRes?.success === false) throw new Error(rulesRes.error || 'Failed to load rules');
      if (status?.success === false) throw new Error(status.error || 'Failed to read Resend status');
      setRules(rulesRes.rules || []);
      setResendStatus(status);
      setLoadedOnce(true);
    } catch (e) {
      setError(e.message || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !loadedOnce) refreshRules();
  }, [open, loadedOnce]);

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
      const res = await createNotificationRule({
        category,
        items,
        userIds: selectedUsers,
      });
      if (res?.success === false) throw new Error(res.error || 'Failed to save rule');
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
      const res = await deleteNotificationRule(id);
      if (res?.success === false) throw new Error(res.error || 'Failed to delete');
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
      const res = await setNotificationRuleEnabled(rule.id, !rule.enabled);
      if (res?.success === false) throw new Error(res.error || 'Failed to update');
      await refreshRules();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTestEmail() {
    setBusy(true);
    setTestMsg(null);
    setError(null);
    try {
      const res = await sendTestNotificationEmail(testUserId || emailUsers[0]?.id);
      if (res?.success === false) throw new Error(res.error || 'Test email failed');
      setTestMsg(`Test email sent to ${res.email}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function userLabel(id) {
    const u = users.find((x) => x.id === id);
    if (!u) return id;
    return u.name ? `${u.name} (${u.email})` : u.email || id;
  }

  const ruleCount = rules.length;

  return (
    <section className="kpr-card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 p-6 text-left hover:bg-portal-surface-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <h2 className="text-base font-semibold">Configure Notifications</h2>
          <p className="text-sm text-portal-text-muted mt-0.5">
            {ruleCount > 0 ? `${ruleCount} rule${ruleCount === 1 ? '' : 's'}` : 'No rules yet'}
            {resendStatus
              ? resendStatus.configured
                ? ' · Resend ready'
                : ' · Resend not configured'
              : ''}
          </p>
        </div>
        <span className="text-portal-text-muted text-lg leading-none" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-5 border-t border-portal-border pt-5">
          <div
            className={`rounded-portal border px-3 py-2 text-sm ${
              resendStatus?.configured
                ? 'border-green-200 bg-green-50 text-green-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            {resendStatus?.configured ? (
              <>
                Resend configured — from <strong>{resendStatus.fromEmail}</strong>
              </>
            ) : resendStatus?.fromRawInvalid ? (
              <>
                Resend API key is set, but <code className="text-xs">RESEND_FROM_EMAIL</code> is
                invalid (<code className="text-xs">{resendStatus.fromRawInvalid}</code>). In Vercel
                set it to a real address like <code className="text-xs">alerts@okavangowater.com</code>
                , then redeploy.
              </>
            ) : (
              <>
                Resend is <strong>not configured</strong>. In Vercel set your Okavango Water{' '}
                <code className="text-xs">RESEND_API_KEY</code> and{' '}
                <code className="text-xs">RESEND_FROM_EMAIL=alerts@okavangowater.com</code>, then
                redeploy.
              </>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="kpr-label">Send test email to</label>
              <select
                className="kpr-input"
                value={testUserId}
                onChange={(e) => setTestUserId(e.target.value)}
              >
                <option value="">Select user…</option>
                {emailUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="kpr-btn-secondary"
              disabled={busy || !testUserId}
              onClick={handleTestEmail}
            >
              Send test
            </button>
          </div>
          {testMsg && <p className="text-sm text-green-800">{testMsg}</p>}

          <p className="text-sm text-portal-text-muted">
            Choose a submission type, the specific items to watch, and which users receive the email.
            Sightings, incidents, and maintenance alert from <strong>anywhere</strong> (not limited to
            the concession). Only fire alerts use the Okavango Delta / KPR area. Species/type must match
            your rule (or select All). Use <strong>Send test</strong> first to confirm Resend works.
          </p>

          <form onSubmit={handleCreate} className="space-y-5 pb-6 border-b border-portal-border">
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

          <h3 className="text-sm font-semibold">Active rules</h3>
          {loading ? (
            <p className="text-sm text-portal-text-muted">Loading…</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-portal-text-muted">No notification rules yet.</p>
          ) : (
            <div className="overflow-auto rounded-portal border border-portal-border">
              <table className="w-full text-sm">
                <thead
                  style={{
                    background: 'linear-gradient(180deg, var(--kpr-green-light), var(--kpr-green))',
                  }}
                >
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
                            rule.enabled
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-portal-danger'
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
        </div>
      )}
    </section>
  );
}
