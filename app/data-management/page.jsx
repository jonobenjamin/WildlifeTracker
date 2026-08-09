'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import AppShell from '@/components/AppShell';
import LeafletMap from '@/components/LeafletMap';
import { useAuth, useRequireRole } from '@/lib/authContext';
import { apiFetch } from '@/lib/api';
import { colorForLabel, dotIcon, fetchGeoJson } from '@/lib/mapIcons';
import { loadRoadsDataset } from '@/lib/roadsDataset';

const DATA_TYPES = [
  { value: 'sightings', label: 'Sightings' },
  { value: 'incidents', label: 'Incidents' },
  { value: 'roads', label: 'Road segments' },
  { value: 'trees', label: 'Trees' },
];

const TREE_SPECIES = [
  'Sossage Tree',
  'Sickle Leaved Albizia',
  'African Mangosteen',
  'Camel Thorn',
  'Fig Tree',
  'Jackal Berry',
  'Knob Thorn',
  'Baobab',
  'Other',
];

function actorName(profile, user) {
  return profile?.name || user?.displayName || profile?.email || user?.email || 'unknown';
}

function itemTitle(type, item) {
  if (type === 'sightings') return item.animal || 'Sighting';
  if (type === 'incidents') return item.incident_type || item.poaching_type || 'Incident';
  if (type === 'roads') return item.name || item.Roads || 'Road';
  if (type === 'trees') return item.species === 'Other' ? item.speciesOther || 'Other tree' : item.species || 'Tree';
  return 'Item';
}

function itemSubtitle(type, item) {
  if (type === 'roads') {
    const when = item.updatedAt || item.createdAt;
    const src = (item.source || '').toLowerCase() === 'user' ? 'User' : 'Base';
    return `${src} · ${item.user || '—'} · ${when ? dayjs(when).format('DD MMM YYYY HH:mm') : '—'}`;
  }
  if (type === 'trees') {
    const when = item.updatedAt || item.createdAt;
    return `${item.user || '—'} · ${when ? dayjs(when).format('DD MMM YYYY HH:mm') : '—'}`;
  }
  return `${item.user || '—'} · ${item.timestamp ? dayjs(item.timestamp).format('DD MMM YYYY HH:mm') : '—'}`;
}

function hasMapGeometry(type, item) {
  if (type === 'roads') return Array.isArray(item.coordinates) && item.coordinates.length >= 2;
  return item.latitude != null && item.longitude != null && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
}

export default function DataManagementPage() {
  const { authorized } = useRequireRole(['admin']);
  const { user, profile } = useAuth();

  const [dataType, setDataType] = useState('sightings');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const mapObj = useRef({ map: null, L: null, layer: null, layersById: {}, boundary: null });
  const [mapReady, setMapReady] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedId(null);
    try {
      if (dataType === 'sightings' || dataType === 'incidents') {
        const res = await apiFetch('/api/observations');
        const cat = dataType === 'sightings' ? 'sighting' : 'incident';
        const rows = (res.data || []).filter((o) => (o.category || '').toLowerCase() === cat);
        setItems(rows);
      } else if (dataType === 'trees') {
        const res = await apiFetch('/api/trees');
        setItems(res.data || []);
      } else if (dataType === 'roads') {
        // Same model as the phone: GeoJSON base network + synced drawn roads.
        const { roads } = await loadRoadsDataset();
        setItems(roads);
      }
    } catch (e) {
      setError(e.message || 'Failed to load data');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [dataType]);

  useEffect(() => {
    if (authorized) loadItems();
  }, [authorized, loadItems]);

  const selectedItem = useMemo(() => items.find((i) => i.id === selectedId) || null, [items, selectedId]);

  const handleReady = useCallback(async (map, L) => {
    mapObj.current.map = map;
    mapObj.current.L = L;
    try {
      const boundary = await fetchGeoJson('/data/geojson/Consession_boundary.geojson');
      mapObj.current.boundary = L.geoJSON(boundary, {
        style: { color: '#4c1918', weight: 2, fillOpacity: 0.03 },
      }).addTo(map);
      map.fitBounds(mapObj.current.boundary.getBounds(), { padding: [24, 24] });
    } catch {
      /* optional */
    }
    setMapReady(true);
  }, []);

  // Draw map layer for current items
  useEffect(() => {
    const { map, L } = mapObj.current;
    if (!map || !L || !mapReady) return;

    if (mapObj.current.layer) {
      map.removeLayer(mapObj.current.layer);
      mapObj.current.layer = null;
    }
    mapObj.current.layersById = {};

    const group = L.layerGroup();
    const bounds = [];

    items.forEach((item) => {
      if (!hasMapGeometry(dataType, item)) return;
      let layer;
      if (dataType === 'roads') {
        const latlngs = item.coordinates.map(([lng, lat]) => [lat, lng]);
        const isUser = (item.source || '').toLowerCase() === 'user';
        layer = L.polyline(latlngs, {
          color: selectedId === item.id ? '#b42318' : isUser ? '#1565C0' : '#8a6d3b',
          weight: selectedId === item.id ? 5 : isUser ? 3 : 2,
          opacity: 0.9,
        });
        latlngs.forEach((ll) => bounds.push(ll));
      } else {
        const color =
          dataType === 'sightings'
            ? colorForLabel(item.animal)
            : dataType === 'incidents'
              ? '#b42318'
              : colorForLabel(item.species);
        const size = selectedId === item.id ? 18 : 12;
        layer = L.marker([item.latitude, item.longitude], {
          icon: dotIcon(L, selectedId === item.id ? '#111827' : color, size),
        });
        bounds.push([item.latitude, item.longitude]);
      }
      layer.bindPopup(`<strong>${escapeHtml(itemTitle(dataType, item))}</strong><br>${escapeHtml(itemSubtitle(dataType, item))}`);
      layer.on('click', () => setSelectedId(item.id));
      layer.addTo(group);
      mapObj.current.layersById[item.id] = layer;
    });

    mapObj.current.layer = group.addTo(map);
    if (bounds.length && !selectedId) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      } catch {
        /* ignore */
      }
    }
  }, [items, dataType, mapReady]); // selected restyle handled below

  // Restyle / pan when selection changes
  useEffect(() => {
    const { map, L, layersById } = mapObj.current;
    if (!map || !L || !mapReady) return;

    Object.entries(layersById).forEach(([id, layer]) => {
      const selected = id === selectedId;
      if (layer.setStyle) {
        const item = items.find((i) => i.id === id);
        const isUser = (item?.source || '').toLowerCase() === 'user';
        layer.setStyle({
          color: selected ? '#b42318' : isUser ? '#1565C0' : '#8a6d3b',
          weight: selected ? 5 : isUser ? 3 : 2,
        });
      } else if (layer.setIcon) {
        const item = items.find((i) => i.id === id);
        if (!item) return;
        const color =
          dataType === 'sightings'
            ? colorForLabel(item.animal)
            : dataType === 'incidents'
              ? '#b42318'
              : colorForLabel(item.species);
        layer.setIcon(dotIcon(L, selected ? '#111827' : color, selected ? 18 : 12));
      }
      if (selected) {
        try {
          if (layer.getBounds) map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 15 });
          else if (layer.getLatLng) map.setView(layer.getLatLng(), Math.max(map.getZoom(), 14));
          layer.openPopup?.();
        } catch {
          /* ignore */
        }
      }
    });
  }, [selectedId, items, dataType, mapReady]);

  async function handleSaveEdit(form) {
    if (!editing) return;
    const id = editing.id;
    setBusy(true);
    try {
      const payload = sanitizeForm(dataType, form);
      if (dataType === 'sightings' || dataType === 'incidents') {
        await apiFetch(`/api/observations/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else if (dataType === 'trees') {
        await apiFetch(`/api/trees/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else if (dataType === 'roads') {
        // Upsert so base GeoJSON segments can be saved into Firestore on first edit.
        await apiFetch(`/api/roads/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...payload,
            coordinates: editing.coordinates,
            source: editing.source || 'static',
          }),
        });
      }
      setEditing(null);
      await loadItems();
      setSelectedId(id);
    } catch (e) {
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const deletedBy = actorName(profile, user);
      const path =
        dataType === 'trees'
          ? `/api/trees/${deleting.id}`
          : dataType === 'roads'
            ? `/api/roads/${deleting.id}`
            : `/api/observations/${deleting.id}`;
      await apiFetch(`${path}?deletedBy=${encodeURIComponent(deletedBy)}`, {
        method: 'DELETE',
        body: JSON.stringify({ deletedBy }),
      });
      setDeleting(null);
      setSelectedId(null);
      await loadItems();
    } catch (e) {
      alert(e.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  if (!authorized) return null;

  return (
    <AppShell title="Data Management">
      <div className="space-y-4">
        <div className="kpr-card p-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <label className="kpr-label">Data type</label>
            <select className="kpr-input" value={dataType} onChange={(e) => setDataType(e.target.value)}>
              {DATA_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="kpr-btn-secondary" onClick={loadItems} disabled={loading}>
            Refresh
          </button>
          <p className="text-xs text-portal-text-muted pb-2.5 ml-auto">
            Select a row or map feature to highlight both. Edit attributes or delete (archived to backup).
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-220px)] min-h-[480px]">
          <section className="kpr-card flex flex-col w-full lg:w-[420px] flex-shrink-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-portal-border flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {DATA_TYPES.find((t) => t.value === dataType)?.label} ({items.length})
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="p-4 text-sm text-portal-text-muted">Loading…</p>
              ) : error ? (
                <p className="p-4 text-sm text-portal-danger">{error}</p>
              ) : items.length === 0 ? (
                <p className="p-4 text-sm text-portal-text-muted">No records for this type.</p>
              ) : (
                <ul className="divide-y divide-portal-border">
                  {items.map((item) => {
                    const selected = item.id === selectedId;
                    return (
                      <li
                        key={item.id}
                        className={`px-3 py-2.5 cursor-pointer transition ${
                          selected ? 'bg-portal-surface-muted' : 'hover:bg-portal-surface-muted/60'
                        }`}
                        style={selected ? { boxShadow: 'inset 3px 0 0 var(--kpr-green-light)' } : undefined}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold truncate">{itemTitle(dataType, item)}</div>
                            <div className="text-xs text-portal-text-muted truncate">{itemSubtitle(dataType, item)}</div>
                            {!hasMapGeometry(dataType, item) && (
                              <div className="text-[11px] text-portal-danger mt-0.5">No map location</div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 flex-shrink-0">
                            <button
                              type="button"
                              className="text-xs font-semibold px-2 py-1 rounded border border-portal-border hover:bg-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(item.id);
                                setEditing(item);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-xs font-semibold px-2 py-1 rounded border border-portal-danger/40 text-portal-danger hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(item.id);
                                setDeleting(item);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="relative flex-1 min-w-0 rounded-portal-lg overflow-hidden border border-portal-border">
            <LeafletMap onReady={handleReady} />
            {selectedItem && (
              <div className="absolute bottom-3 left-3 right-3 z-[500] kpr-card px-3 py-2 text-xs">
                <span className="font-semibold">{itemTitle(dataType, selectedItem)}</span>
                <span className="text-portal-text-muted"> — {itemSubtitle(dataType, selectedItem)}</span>
              </div>
            )}
          </section>
        </div>
      </div>

      {editing && (
        <EditModal
          dataType={dataType}
          item={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={handleSaveEdit}
        />
      )}
      {deleting && (
        <DeleteConfirmModal
          title={itemTitle(dataType, deleting)}
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </AppShell>
  );
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function EditModal({ dataType, item, busy, onClose, onSave }) {
  const [form, setForm] = useState(() => initialForm(dataType, item));
  const [error, setError] = useState(null);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message || 'Save failed');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[2000] grid place-items-center p-4" onClick={onClose}>
      <div className="kpr-card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-4">Edit {DATA_TYPES.find((t) => t.value === dataType)?.label.slice(0, -1) || 'record'}</h3>
        <form onSubmit={submit} className="space-y-3">
          {(dataType === 'sightings' || dataType === 'incidents') && (
            <>
              {dataType === 'sightings' && (
                <Field label="Species / animal" value={form.animal} onChange={(v) => setField('animal', v)} />
              )}
              {dataType === 'incidents' && (
                <>
                  <Field label="Incident type" value={form.incident_type} onChange={(v) => setField('incident_type', v)} />
                  <Field label="Poaching type" value={form.poaching_type} onChange={(v) => setField('poaching_type', v)} />
                  <Field label="Poached animal" value={form.poached_animal} onChange={(v) => setField('poached_animal', v)} />
                </>
              )}
              <Field label="Reported by" value={form.user} onChange={(v) => setField('user', v)} />
              <Field
                label="Timestamp"
                type="datetime-local"
                value={form.timestamp}
                onChange={(v) => setField('timestamp', v)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Latitude" type="number" value={form.latitude} onChange={(v) => setField('latitude', v)} />
                <Field label="Longitude" type="number" value={form.longitude} onChange={(v) => setField('longitude', v)} />
              </div>
              <Field label="Notes" value={form.notes} onChange={(v) => setField('notes', v)} textarea />
            </>
          )}
          {dataType === 'trees' && (
            <>
              <div>
                <label className="kpr-label">Species</label>
                <select className="kpr-input" value={form.species} onChange={(e) => setField('species', e.target.value)}>
                  {TREE_SPECIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              {form.species === 'Other' && (
                <Field label="Other species" value={form.speciesOther} onChange={(v) => setField('speciesOther', v)} />
              )}
              <Field label="Recorded by" value={form.user} onChange={(v) => setField('user', v)} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Latitude" type="number" value={form.latitude} onChange={(v) => setField('latitude', v)} />
                <Field label="Longitude" type="number" value={form.longitude} onChange={(v) => setField('longitude', v)} />
              </div>
              <Field label="Notes" value={form.notes} onChange={(v) => setField('notes', v)} textarea />
            </>
          )}
          {dataType === 'roads' && (
            <>
              <Field label="Road name" value={form.name} onChange={(v) => setField('name', v)} required />
              <Field label="Recorded by" value={form.user} onChange={(v) => setField('user', v)} />
              <p className="text-xs text-portal-text-muted">
                Geometry is kept as drawn. Rename and attribution can be edited here.
              </p>
            </>
          )}
          {error && <p className="text-sm text-portal-danger">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" className="kpr-btn flex-1" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
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

function Field({ label, value, onChange, type = 'text', textarea, required }) {
  return (
    <div>
      <label className="kpr-label">{label}</label>
      {textarea ? (
        <textarea className="kpr-input min-h-[72px]" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          className="kpr-input"
          type={type}
          step={type === 'number' ? 'any' : undefined}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      )}
    </div>
  );
}

function initialForm(dataType, item) {
  if (dataType === 'sightings') {
    return {
      animal: item.animal || '',
      user: item.user || '',
      timestamp: toDatetimeLocal(item.timestamp),
      latitude: item.latitude ?? '',
      longitude: item.longitude ?? '',
      notes: item.notes || '',
    };
  }
  if (dataType === 'incidents') {
    return {
      incident_type: item.incident_type || '',
      poaching_type: item.poaching_type || '',
      poached_animal: item.poached_animal || '',
      user: item.user || '',
      timestamp: toDatetimeLocal(item.timestamp),
      latitude: item.latitude ?? '',
      longitude: item.longitude ?? '',
      notes: item.notes || '',
    };
  }
  if (dataType === 'trees') {
    return {
      species: item.species || 'Other',
      speciesOther: item.speciesOther || '',
      user: item.user || '',
      latitude: item.latitude ?? '',
      longitude: item.longitude ?? '',
      notes: item.notes || '',
    };
  }
  return {
    name: item.name || item.Roads || '',
    user: item.user || '',
  };
}

function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = dayjs(iso);
  if (!d.isValid()) return '';
  return d.format('YYYY-MM-DDTHH:mm');
}

function sanitizeForm(dataType, form) {
  const out = { ...form };
  if (out.latitude !== undefined && out.latitude !== '') out.latitude = Number(out.latitude);
  if (out.longitude !== undefined && out.longitude !== '') out.longitude = Number(out.longitude);
  if (out.timestamp) {
    const d = dayjs(out.timestamp);
    out.timestamp = d.isValid() ? d.toISOString() : out.timestamp;
  }
  if (dataType === 'roads' && out.name) out.name = String(out.name).trim();
  return out;
}

function DeleteConfirmModal({ title, busy, onClose, onConfirm }) {
  const [typed, setTyped] = useState('');
  const ok = typed.trim().toLowerCase() === 'delete';

  return (
    <div className="fixed inset-0 bg-black/40 z-[2000] grid place-items-center p-4" onClick={onClose}>
      <div className="kpr-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-2 text-portal-danger">Delete record</h3>
        <p className="text-sm text-portal-text-muted mb-4">
          This will remove <strong className="text-portal-text">{title}</strong> from live data and move a copy to backup storage
          (<code className="text-xs">deleted_records</code>), including who deleted it and when.
        </p>
        <label className="kpr-label">Type delete to confirm</label>
        <input
          className="kpr-input mb-4"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="delete"
          autoFocus
        />
        <div className="flex gap-3">
          <button type="button" className="kpr-btn flex-1 !bg-portal-danger" disabled={!ok || busy} onClick={onConfirm}>
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
          <button type="button" className="kpr-btn-secondary flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
