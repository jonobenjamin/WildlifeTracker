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
  updateNotificationRule,
  deleteNotificationRule,
  setNotificationRuleEnabled,
  getResendStatus,
  sendTestNotificationEmail,
} from '@/lib/actions/notificationRules';
import {
  diagnoseNotificationSetup,
  flushPendingObservationAlerts,
  replayLatestSightingAlert,
  replayObservationAlert,
} from '@/lib/actions/observationAlerts';

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
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [testUserId, setTestUserId] = useState('');
  const [replayId, setReplayId] = useState('');
  const [replayAnimal, setReplayAnimal] = useState('Lion');
  const [replayMsg, setReplayMsg] = useState(null);
  const [diag, setDiag] = useState(null);

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
    // Load status/rules as soon as Admin mounts so the collapsed header is accurate
    refreshRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editingRuleId) return;
    setSelectedItems([]);
    setAllItems(false);
  }, [category, editingRuleId]);

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

  function resetForm() {
    setEditingRuleId(null);
    setCategory('sighting');
    setSelectedItems([]);
    setSelectedUsers([]);
    setAllItems(false);
    setError(null);
  }

  function startEdit(rule) {
    setError(null);
    setEditingRuleId(rule.id);
    setCategory(rule.category || 'sighting');
    const items = Array.isArray(rule.items) ? rule.items : [];
    const isAll = items.includes(ALL_ITEMS_VALUE) || items.length === 0;
    setAllItems(isAll);
    setSelectedItems(isAll ? [] : items);
    setSelectedUsers(Array.isArray(rule.userIds) ? [...rule.userIds] : []);
    // Scroll form into view for mobile
    if (typeof document !== 'undefined') {
      document.getElementById('notification-rule-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const items = allItems ? [ALL_ITEMS_VALUE] : selectedItems;
      const payload = {
        category,
        items,
        userIds: selectedUsers,
      };
      const res = editingRuleId
        ? await updateNotificationRule(editingRuleId, payload)
        : await createNotificationRule(payload);
      if (res?.success === false) {
        throw new Error(res.error || (editingRuleId ? 'Failed to update rule' : 'Failed to save rule'));
      }
      resetForm();
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
      if (editingRuleId === id) resetForm();
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

  async function handleDiagnose() {
    setBusy(true);
    setError(null);
    setDiag(null);
    try {
      const res = await diagnoseNotificationSetup();
      if (res?.success === false) throw new Error(res.error || 'Diagnose failed');
      setDiag(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleFlush() {
    setBusy(true);
    setReplayMsg(null);
    setError(null);
    try {
      const res = await flushPendingObservationAlerts({ hours: 168, force: true, limit: 30 });
      if (res?.success === false) throw new Error(res.error || 'Flush failed');
      const firstFail = (res.results || []).find((r) => r.success === false);
      setReplayMsg(
        `${res.message}.` +
          (firstFail ? ` First failure: ${firstFail.reason || firstFail.error || 'unknown'} (obs ${firstFail.observationId})` : '')
      );
      if (res.sent === 0 && res.failed > 0 && firstFail) {
        setError(firstFail.reason || firstFail.error || 'All alerts failed — see message above');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReplayLatest() {
    setBusy(true);
    setReplayMsg(null);
    setError(null);
    try {
      const res = await replayLatestSightingAlert(replayAnimal);
      if (res?.success === false) {
        throw new Error(res.error || res.reason || 'Replay failed');
      }
      setReplayMsg(`Alert sent for ${res.animal || replayAnimal} (${res.observationId}).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReplayById() {
    setBusy(true);
    setReplayMsg(null);
    setError(null);
    try {
      const res = await replayObservationAlert(replayId);
      if (res?.success === false) {
        throw new Error(res.error || res.reason || 'Replay failed');
      }
      setReplayMsg(`Alert sent for observation ${res.observationId}.`);
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
            {loading && !loadedOnce
              ? 'Loading…'
              : `${ruleCount} rule${ruleCount === 1 ? '' : 's'}${
                  resendStatus
                    ? resendStatus.configured
                      ? ' · Resend ready'
                      : ' · Resend not configured'
                    : ''
                }`}
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

          <div className="rounded-portal border border-portal-border p-4 space-y-3 bg-portal-surface-muted/30">
            <h3 className="text-sm font-semibold">Fix stuck alerts</h3>
            <p className="text-xs text-portal-text-muted">
              Plain test emails can work while sighting alerts fail (rules/recipients). Use these to
              see the real error and force-send for recent Firestore observations.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="kpr-btn-secondary" disabled={busy} onClick={handleDiagnose}>
                Diagnose rules
              </button>
              <button type="button" className="kpr-btn" disabled={busy} onClick={handleFlush}>
                Send alerts for recent observations
              </button>
            </div>
            {diag && (
              <pre className="text-[11px] overflow-auto max-h-48 rounded-portal bg-black/5 p-3 whitespace-pre-wrap">
                {JSON.stringify(diag, null, 2)}
              </pre>
            )}
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-portal-border">
              <div>
                <label className="kpr-label">Species</label>
                <input
                  className="kpr-input"
                  value={replayAnimal}
                  onChange={(e) => setReplayAnimal(e.target.value)}
                  placeholder="Lion"
                />
              </div>
              <button
                type="button"
                className="kpr-btn-secondary"
                disabled={busy || !replayAnimal}
                onClick={handleReplayLatest}
              >
                Email latest {replayAnimal || 'sighting'}
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]">
                <label className="kpr-label">Or observation document ID</label>
                <input
                  className="kpr-input"
                  value={replayId}
                  onChange={(e) => setReplayId(e.target.value)}
                  placeholder="Paste Firestore document id"
                />
              </div>
              <button
                type="button"
                className="kpr-btn-secondary"
                disabled={busy || !replayId.trim()}
                onClick={handleReplayById}
              >
                Replay by ID
              </button>
            </div>
            {replayMsg && <p className="text-sm text-green-800">{replayMsg}</p>}
          </div>

          <p className="text-sm text-portal-text-muted">
            Choose a submission type, the specific items to watch, and which users receive the email.
            Sightings alert from anywhere. Species must match your rule (or select All). Use Edit on a
            rule to add or remove recipient emails.
          </p>

          <form
            id="notification-rule-form"
            onSubmit={handleCreate}
            className="space-y-5 pb-6 border-b border-portal-border"
          >
            {editingRuleId && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-portal border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <span>Editing rule — change species and/or recipient emails, then save.</span>
                <button type="button" className="text-xs font-semibold underline" onClick={resetForm} disabled={busy}>
                  Cancel edit
                </button>
              </div>
            )}
            <div>
              <label className="kpr-label">Submission type</label>
              <select
                className="kpr-input max-w-xs"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={!!editingRuleId}
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

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="kpr-btn"
                disabled={
                  busy ||
                  selectedUsers.length === 0 ||
                  (!allItems && selectedItems.length === 0)
                }
              >
                {busy
                  ? 'Saving…'
                  : editingRuleId
                    ? 'Save changes'
                    : 'Add notification rule'}
              </button>
              {editingRuleId && (
                <button type="button" className="kpr-btn-secondary" disabled={busy} onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
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
                          className="text-xs font-semibold text-kpr-green-light disabled:opacity-50"
                          disabled={busy}
                          onClick={() => startEdit(rule)}
                        >
                          Edit
                        </button>
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
