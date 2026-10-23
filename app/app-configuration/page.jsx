'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { useRequireRole } from '@/lib/authContext';
import { apiFetch, apiUrl } from '@/lib/api';
import { auth } from '@/lib/firebase/client';

const TAXA = ['Aves', 'Mammals', 'Reptiles'];
const PROFILES = [
  { value: 'high', label: 'High profile' },
  { value: 'general', label: 'General' },
];

async function apiUpload(path, formData) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in required');
  const token = await user.getIdToken();
  if (!token) throw new Error('Could not obtain session token — sign in again');

  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Upload failed (${res.status})`);
  }
  return data;
}

function IconThumb({ src, label, size = 36 }) {
  if (!src) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-portal-surface-muted text-[10px] font-semibold text-portal-text-muted border border-portal-border"
        style={{ width: size, height: size }}
        title="No icon — map will use a colour dot"
      >
        •
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label || 'icon'}
      width={size}
      height={size}
      className="rounded object-contain bg-white border border-portal-border"
      style={{ width: size, height: size }}
    />
  );
}

function StringListEditor({ label, hint, values, onChange }) {
  const [draft, setDraft] = useState('');

  function addItem() {
    const next = draft.trim();
    if (!next) return;
    if (values.some((v) => v.toLowerCase() === next.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...values, next]);
    setDraft('');
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <label className="kpr-label mb-0">{label}</label>
        {hint && <span className="text-[11px] text-portal-text-muted">{hint}</span>}
      </div>
      <ul className="space-y-1.5">
        {values.length === 0 && (
          <li className="text-xs text-portal-text-muted italic">None yet — add one below.</li>
        )}
        {values.map((value, idx) => (
          <li key={`${value}-${idx}`} className="flex items-center gap-2">
            <input
              className="kpr-input flex-1"
              value={value}
              onChange={(e) => {
                const next = [...values];
                next[idx] = e.target.value;
                onChange(next);
              }}
            />
            <button
              type="button"
              className="text-xs font-semibold px-2 py-2 rounded border border-portal-danger/40 text-portal-danger hover:bg-red-50"
              onClick={() => onChange(values.filter((_, i) => i !== idx))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          className="kpr-input flex-1"
          value={draft}
          placeholder={`Add ${label.toLowerCase().replace(/s$/, '')}…`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addItem();
            }
          }}
        />
        <button type="button" className="kpr-btn-secondary whitespace-nowrap" onClick={addItem}>
          + Add
        </button>
      </div>
    </div>
  );
}

function emptySpeciesForm() {
  return {
    name: '',
    scientificName: '',
    taxa: 'Mammals',
    profile: 'general',
    ageCategories: [],
    activities: [],
    sexes: ['Male', 'Female', 'Mixed'],
    knownNames: [],
  };
}

function emptyIncidentForm() {
  return {
    name: '',
    subtypes: [],
  };
}

export default function AppConfigurationPage() {
  const { authorized } = useRequireRole(['admin']);
  const [tab, setTab] = useState('sightings');
  const [species, setSpecies] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingSpecies, setEditingSpecies] = useState(null);
  const [creatingSpecies, setCreatingSpecies] = useState(false);
  const [editingIncident, setEditingIncident] = useState(null);
  const [creatingIncident, setCreatingIncident] = useState(false);
  const [filter, setFilter] = useState('');
  const [taxaFilter, setTaxaFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/app-config');
      setSpecies(res.data?.species || []);
      setIncidents(res.data?.incidents || []);
    } catch (e) {
      setError(e.message || 'Failed to load configuration');
      setSpecies([]);
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authorized) load();
  }, [authorized, load]);

  const filteredSpecies = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return species.filter((s) => {
      if (taxaFilter && s.taxa !== taxaFilter) return false;
      if (!q) return true;
      return (
        String(s.name || '')
          .toLowerCase()
          .includes(q) ||
        String(s.scientificName || '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [species, filter, taxaFilter]);

  async function saveSpecies(form, id) {
    setBusy(true);
    try {
      if (id) {
        await apiFetch(`/api/app-config/species/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/api/app-config/species', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setEditingSpecies(null);
      setCreatingSpecies(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteSpecies(item) {
    if (!window.confirm(`Delete species “${item.name}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/app-config/species/${item.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      alert(e.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function uploadSpeciesIcon(item, file) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('icon', file);
      await apiUpload(`/api/app-config/species/${item.id}/icon`, fd);
      await load();
    } catch (e) {
      alert(e.message || 'Icon upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveIncident(form, id) {
    setBusy(true);
    try {
      if (id) {
        await apiFetch(`/api/app-config/incidents/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/api/app-config/incidents', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setEditingIncident(null);
      setCreatingIncident(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteIncident(item) {
    if (!window.confirm(`Delete incident type “${item.name}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/app-config/incidents/${item.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      alert(e.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function uploadIncidentIcon(item, file) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('icon', file);
      await apiUpload(`/api/app-config/incidents/${item.id}/icon`, fd);
      await load();
    } catch (e) {
      alert(e.message || 'Icon upload failed');
    } finally {
      setBusy(false);
    }
  }

  if (!authorized) return null;

  return (
    <AppShell title="App configuration">
      <div className="space-y-4">
        <div className="kpr-card p-4 flex flex-wrap items-center gap-3">
          <div className="flex rounded-md border border-portal-border overflow-hidden">
            <button
              type="button"
              className={`px-4 py-2 text-sm font-semibold ${
                tab === 'sightings' ? 'bg-portal-surface-muted' : 'bg-white hover:bg-portal-surface-muted/50'
              }`}
              onClick={() => setTab('sightings')}
            >
              Sightings ({species.length})
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-semibold border-l border-portal-border ${
                tab === 'incidents' ? 'bg-portal-surface-muted' : 'bg-white hover:bg-portal-surface-muted/50'
              }`}
              onClick={() => setTab('incidents')}
            >
              Incidents ({incidents.length})
            </button>
          </div>
          <button type="button" className="kpr-btn-secondary" onClick={load} disabled={loading || busy}>
            Refresh
          </button>
          <p className="text-xs text-portal-text-muted ml-auto max-w-md">
            Manage species and incident catalogs for the field app. Icons are stored in Firebase; if a species has no
            icon, the map keeps using a colour dot. App wiring comes next — this page only builds the catalog.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-portal-text-muted">Loading configuration…</p>
        ) : error ? (
          <p className="text-sm text-portal-danger">{error}</p>
        ) : tab === 'sightings' ? (
          <section className="kpr-card overflow-hidden">
            <div className="px-4 py-3 border-b border-portal-border flex flex-wrap gap-3 items-center">
              <h2 className="text-sm font-semibold">Species</h2>
              <input
                className="kpr-input max-w-[200px]"
                placeholder="Search…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <select className="kpr-input max-w-[140px]" value={taxaFilter} onChange={(e) => setTaxaFilter(e.target.value)}>
                <option value="">All taxa</option>
                {TAXA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="kpr-btn ml-auto"
                onClick={() => {
                  setCreatingSpecies(true);
                  setEditingSpecies(null);
                }}
              >
                + Add species
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-portal-surface-muted/60 text-left text-xs text-portal-text-muted">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Icon</th>
                    <th className="px-3 py-2.5 font-semibold">Species</th>
                    <th className="px-3 py-2.5 font-semibold">Scientific</th>
                    <th className="px-3 py-2.5 font-semibold">Taxa</th>
                    <th className="px-3 py-2.5 font-semibold">Profile</th>
                    <th className="px-3 py-2.5 font-semibold">Ages</th>
                    <th className="px-3 py-2.5 font-semibold">Sexes</th>
                    <th className="px-3 py-2.5 font-semibold">Activities</th>
                    <th className="px-3 py-2.5 font-semibold">Names</th>
                    <th className="px-3 py-2.5 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-portal-border">
                  {filteredSpecies.map((item) => (
                    <tr key={item.id} className="hover:bg-portal-surface-muted/40">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <IconThumb src={item.iconUrl} label={item.name} />
                          <label className="text-[11px] font-semibold text-portal-text-muted cursor-pointer hover:underline">
                            Upload
                            <input
                              type="file"
                              accept="image/*,.svg"
                              className="hidden"
                              disabled={busy}
                              onChange={(e) => uploadSpeciesIcon(item, e.target.files?.[0])}
                            />
                          </label>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-semibold">{item.name}</td>
                      <td className="px-3 py-2 text-portal-text-muted italic">{item.scientificName || '—'}</td>
                      <td className="px-3 py-2">{item.taxa}</td>
                      <td className="px-3 py-2 capitalize">{item.profile === 'high' ? 'High profile' : 'General'}</td>
                      <td className="px-3 py-2 text-xs text-portal-text-muted">{(item.ageCategories || []).length}</td>
                      <td className="px-3 py-2 text-xs text-portal-text-muted">{(item.sexes || []).length}</td>
                      <td className="px-3 py-2 text-xs text-portal-text-muted">{(item.activities || []).length}</td>
                      <td className="px-3 py-2 text-xs text-portal-text-muted">{(item.knownNames || []).length}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          className="text-xs font-semibold px-2 py-1 rounded border border-portal-border mr-1"
                          onClick={() => {
                            setEditingSpecies(item);
                            setCreatingSpecies(false);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold px-2 py-1 rounded border border-portal-danger/40 text-portal-danger"
                          onClick={() => deleteSpecies(item)}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredSpecies.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-portal-text-muted">
                        No species match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="kpr-card overflow-hidden">
            <div className="px-4 py-3 border-b border-portal-border flex items-center gap-3">
              <h2 className="text-sm font-semibold">Incident types</h2>
              <button
                type="button"
                className="kpr-btn ml-auto"
                onClick={() => {
                  setCreatingIncident(true);
                  setEditingIncident(null);
                }}
              >
                + Add incident type
              </button>
            </div>
            <ul className="divide-y divide-portal-border">
              {incidents.map((item) => (
                <li key={item.id} className="px-4 py-3 flex flex-wrap items-center gap-4">
                  <IconThumb src={item.iconUrl} label={item.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{item.name}</div>
                    <div className="text-xs text-portal-text-muted">
                      {(item.subtypes || []).length
                        ? `Subtypes: ${(item.subtypes || []).join(', ')}`
                        : 'No subtypes'}
                    </div>
                  </div>
                  <label className="text-xs font-semibold text-portal-text-muted cursor-pointer hover:underline">
                    Upload icon
                    <input
                      type="file"
                      accept="image/*,.svg"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => uploadIncidentIcon(item, e.target.files?.[0])}
                    />
                  </label>
                  <button
                    type="button"
                    className="text-xs font-semibold px-2 py-1 rounded border border-portal-border"
                    onClick={() => {
                      setEditingIncident(item);
                      setCreatingIncident(false);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold px-2 py-1 rounded border border-portal-danger/40 text-portal-danger"
                    onClick={() => deleteIncident(item)}
                    disabled={busy}
                  >
                    Delete
                  </button>
                </li>
              ))}
              {incidents.length === 0 && (
                <li className="px-4 py-8 text-center text-portal-text-muted">No incident types yet.</li>
              )}
            </ul>
          </section>
        )}
      </div>

      {(creatingSpecies || editingSpecies) && (
        <SpeciesEditorModal
          item={editingSpecies}
          busy={busy}
          onClose={() => {
            setCreatingSpecies(false);
            setEditingSpecies(null);
          }}
          onSave={saveSpecies}
        />
      )}

      {(creatingIncident || editingIncident) && (
        <IncidentEditorModal
          item={editingIncident}
          busy={busy}
          onClose={() => {
            setCreatingIncident(false);
            setEditingIncident(null);
          }}
          onSave={saveIncident}
        />
      )}
    </AppShell>
  );
}

function SpeciesEditorModal({ item, busy, onClose, onSave }) {
  const [form, setForm] = useState(() =>
    item
      ? {
          name: item.name || '',
          scientificName: item.scientificName || '',
          taxa: item.taxa || 'Mammals',
          profile: item.profile === 'high' ? 'high' : 'general',
          ageCategories: [...(item.ageCategories || [])],
          activities: [...(item.activities || [])],
          sexes: Array.isArray(item.sexes) ? [...item.sexes] : ['Male', 'Female', 'Mixed'],
          knownNames: [...(item.knownNames || [])],
        }
      : emptySpeciesForm()
  );
  const [error, setError] = useState(null);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError('Species name is required');
      return;
    }
    try {
      await onSave(
        {
          ...form,
          name: form.name.trim(),
          scientificName: form.scientificName.trim(),
          ageCategories: form.ageCategories.map((v) => v.trim()).filter(Boolean),
          activities: form.activities.map((v) => v.trim()).filter(Boolean),
          sexes: form.sexes.map((v) => v.trim()).filter(Boolean),
          knownNames: form.knownNames.map((v) => v.trim()).filter(Boolean),
        },
        item?.id
      );
    } catch (err) {
      setError(err.message || 'Save failed');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[2000] grid place-items-center p-4" onClick={onClose}>
      <div className="kpr-card w-full max-w-xl p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-4">{item ? 'Edit species' : 'Add species'}</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="kpr-label">Species name</label>
            <input className="kpr-input" value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          </div>
          <div>
            <label className="kpr-label">Scientific name</label>
            <input
              className="kpr-input"
              value={form.scientificName}
              onChange={(e) => setField('scientificName', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="kpr-label">Taxa</label>
              <select className="kpr-input" value={form.taxa} onChange={(e) => setField('taxa', e.target.value)}>
                {TAXA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="kpr-label">Profile</label>
              <select className="kpr-input" value={form.profile} onChange={(e) => setField('profile', e.target.value)}>
                {PROFILES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <StringListEditor
            label="Age categories"
            hint="e.g. Calf, then add Sub-adult, Adult…"
            values={form.ageCategories}
            onChange={(v) => setField('ageCategories', v)}
          />
          <StringListEditor
            label="Sexes"
            hint="e.g. Male, Female, Mixed. Leave empty to hide sex on the phone."
            values={form.sexes}
            onChange={(v) => setField('sexes', v)}
          />
          <StringListEditor
            label="Activity types"
            hint="e.g. Sleeping, then add Hunting…"
            values={form.activities}
            onChange={(v) => setField('activities', v)}
          />
          <StringListEditor
            label="Known names / groups"
            hint="Pride names, named individuals, vulture subtypes…"
            values={form.knownNames}
            onChange={(v) => setField('knownNames', v)}
          />

          {item?.iconUrl && (
            <div className="flex items-center gap-3 text-xs text-portal-text-muted">
              <IconThumb src={item.iconUrl} label={item.name} size={48} />
              Current icon — upload a new one from the list row to replace.
            </div>
          )}

          {error && <p className="text-sm text-portal-danger">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" className="kpr-btn flex-1" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="kpr-btn-secondary flex-1" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IncidentEditorModal({ item, busy, onClose, onSave }) {
  const [form, setForm] = useState(() =>
    item
      ? {
          name: item.name || '',
          subtypes: [...(item.subtypes || [])],
        }
      : emptyIncidentForm()
  );
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError('Incident name is required');
      return;
    }
    try {
      await onSave(
        {
          name: form.name.trim(),
          subtypes: form.subtypes.map((v) => v.trim()).filter(Boolean),
        },
        item?.id
      );
    } catch (err) {
      setError(err.message || 'Save failed');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[2000] grid place-items-center p-4" onClick={onClose}>
      <div className="kpr-card w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-4">{item ? 'Edit incident type' : 'Add incident type'}</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="kpr-label">Incident name</label>
            <input
              className="kpr-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <StringListEditor
            label="Subtypes"
            hint="e.g. Carcass, Snare, Poacher…"
            values={form.subtypes}
            onChange={(v) => setForm((f) => ({ ...f, subtypes: v }))}
          />
          {item?.iconUrl && (
            <div className="flex items-center gap-3 text-xs text-portal-text-muted">
              <IconThumb src={item.iconUrl} label={item.name} size={48} />
              Current icon — upload a new one from the list row to replace.
            </div>
          )}
          {error && <p className="text-sm text-portal-danger">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" className="kpr-btn flex-1" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="kpr-btn-secondary flex-1" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
