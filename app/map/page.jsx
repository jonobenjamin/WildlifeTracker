'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import AppShell from '@/components/AppShell';
import LeafletMap from '@/components/LeafletMap';
import MapLegend from '@/components/MapLegend';
import MapFilterPanel from '@/components/MapFilterPanel';
import WaterTrendsModal from '@/components/WaterTrendsModal';
import WaterExtentSlider from '@/components/WaterExtentSlider';
import { useAuth, useRequireRole } from '@/lib/authContext';
import { apiFetch } from '@/lib/api';
import { divIcon, dotIcon, recentPinIcon, colorForLabel, ensureHeatPlugin, fetchGeoJson } from '@/lib/mapIcons';
import { attachWeatherPopup } from '@/lib/weather';

const LEGEND_ITEMS = [
  { key: 'roads', label: 'Roads', emoji: '🛣️' },
  { key: 'camps', label: 'Camps', emoji: '🏕️' },
  { key: 'poi', label: 'Points of interest', emoji: '📍' },
];

const WATER_LOCATIONS = {
  tuludi: { name: 'Tuludi', coords: [-19.138159, 23.564946] },
  'sable-alley': { name: 'Sable Alley', coords: [-19.128241, 23.661295] },
  'little-sable': { name: 'Little Sable', coords: [-19.151743, 23.695365] },
};

const CATEGORY_MAP = { sightings: 'sighting', maintenance: 'maintenance', incidents: 'incident' };
const RECENT_LABEL = { sightings: 'SIGHTING', maintenance: 'MAINTENANCE', incidents: 'INCIDENT' };

function withinDateFilters(dateStr, { dateStart, dateEnd, month, year }) {
  if (!dateStr) return !(dateStart || dateEnd || month || year);
  const d = dayjs(dateStr);
  if (!d.isValid()) return false;
  if (dateStart && d.isBefore(dayjs(dateStart), 'day')) return false;
  if (dateEnd && d.isAfter(dayjs(dateEnd).endOf('day'))) return false;
  if (month && d.format('MM') !== month) return false;
  if (year && String(d.year()) !== String(year)) return false;
  return true;
}

function popupHtml(o) {
  const lines = [`<strong class="capitalize">${escapeHtml(o.category)}</strong>`];
  if (o.animal) lines.push(`Species: ${escapeHtml(o.animal)}`);
  if (o.incident_type) lines.push(`Type: ${escapeHtml(o.incident_type)}`);
  if (o.maintenance_type) lines.push(`Type: ${escapeHtml(o.maintenance_type)}`);
  if (o.user) lines.push(`By: ${escapeHtml(o.user)}`);
  if (o.timestamp) lines.push(dayjs(o.timestamp).format('DD MMM YYYY HH:mm'));
  return lines.join('<br>');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default function ConcessionMapPage() {
  const { authorized } = useRequireRole(['admin']);
  const { user } = useAuth();
  const mapObj = useRef({ map: null, L: null, baseLayers: {}, activeLayer: null, recentLayer: null, waterMarkers: [], fireLayer: null });
  // React state mirror of the Leaflet map — refs alone don't re-render, so the
  // WaterExtentSlider (which needs map + L) would never mount without this.
  const [mapReady, setMapReady] = useState({ map: null, L: null });

  const [toggles, setToggles] = useState({ roads: false, camps: true, poi: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [allObservations, setAllObservations] = useState([]);
  const [allTrees, setAllTrees] = useState([]);

  const [viewMode, setViewMode] = useState('sightings');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [species, setSpecies] = useState('');
  const [treeType, setTreeType] = useState('');
  const [displayMode, setDisplayMode] = useState('actual');
  const [showRecent, setShowRecent] = useState(false);
  const [total, setTotal] = useState(0);

  const [waterLocation, setWaterLocation] = useState('');
  const [waterForm, setWaterForm] = useState({});
  const [waterSubmitting, setWaterSubmitting] = useState(false);
  const [waterTrendsFor, setWaterTrendsFor] = useState(null);

  const [fireSensor, setFireSensor] = useState('');
  const [fireDays, setFireDays] = useState('3');
  const [fires, setFires] = useState([]);
  const [firesLoaded, setFiresLoaded] = useState(false);
  const [firesLoading, setFiresLoading] = useState(false);
  const [firesError, setFiresError] = useState(null);

  const speciesOptions = useMemo(() => {
    const set = new Set();
    allObservations.forEach((o) => {
      if ((o.category || '').toLowerCase() === 'sighting' && o.animal) set.add(o.animal);
    });
    return Array.from(set).sort();
  }, [allObservations]);

  const treeOptions = useMemo(() => {
    const set = new Set();
    allTrees.forEach((t) => {
      if (t.species) set.add(t.species);
    });
    return Array.from(set).sort();
  }, [allTrees]);

  const applyBaseVisibility = useCallback(() => {
    const { map, baseLayers } = mapObj.current;
    if (!map) return;
    Object.entries(baseLayers).forEach(([key, layer]) => {
      if (!layer) return;
      const shouldShow = toggles[key];
      const has = map.hasLayer(layer);
      if (shouldShow && !has) map.addLayer(layer);
      if (!shouldShow && has) map.removeLayer(layer);
    });
  }, [toggles]);

  useEffect(() => {
    applyBaseVisibility();
  }, [toggles, applyBaseVisibility]);

  const handleReady = useCallback(async (map, L) => {
    mapObj.current.map = map;
    mapObj.current.L = L;
    setMapReady({ map, L });
    try {
      const [boundary, roads, camps, poi] = await Promise.all([
        fetchGeoJson('/data/geojson/Consession_boundary.geojson'),
        fetchGeoJson('/data/geojson/KPR_roads.geojson'),
        fetchGeoJson('/data/geojson/Camps.geojson'),
        fetchGeoJson('/data/geojson/KPR_POI.geojson').catch(() => null),
      ]);

      const boundaryLayer = L.geoJSON(boundary, {
        style: { color: '#4c1918', weight: 2.5, fillOpacity: 0.03 },
      }).addTo(map);
      map.fitBounds(boundaryLayer.getBounds(), { padding: [20, 20] });

      mapObj.current.baseLayers.roads = L.geoJSON(roads, {
        style: { color: '#8a6d3b', weight: 1.5, opacity: 0.8 },
      });

      mapObj.current.baseLayers.camps = L.geoJSON(camps, {
        pointToLayer: (feature, latlng) => L.marker(latlng, { icon: divIcon(L, 'camp') }),
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.Camps || feature.properties?.name || 'Camp';
          const baseHtml = `<strong>${escapeHtml(name)}</strong>`;
          layer.bindPopup(baseHtml);
          const latlng = layer.getLatLng();
          attachWeatherPopup(layer, latlng.lat, latlng.lng, baseHtml);
        },
      });

      if (poi) {
        mapObj.current.baseLayers.poi = L.geoJSON(poi, {
          pointToLayer: (feature, latlng) => L.marker(latlng, { icon: divIcon(L, 'poi') }),
          onEachFeature: (feature, layer) => {
            const name = feature.properties?.name || feature.properties?.['what it is'] || 'Point of interest';
            layer.bindPopup(`<strong>${escapeHtml(name)}</strong>`);
          },
        });
      }

      applyBaseVisibility();

      const [treesRes, obsRes] = await Promise.all([
        apiFetch('/api/trees').catch(() => ({ data: [] })),
        apiFetch('/api/observations').catch(() => ({ data: [] })),
      ]);

      setAllTrees(treesRes.data || []);
      setAllObservations(obsRes.data || []);
      setLoading(false);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose a global hook so Leaflet popup buttons (plain HTML strings) can open React modals.
  useEffect(() => {
    window.__kprShowWaterTrends = (key) => setWaterTrendsFor(key);
    return () => {
      delete window.__kprShowWaterTrends;
    };
  }, []);

  // Render the single "active" data layer for the current view mode + filters.
  useEffect(() => {
    const { map, L } = mapObj.current;
    if (!map || !L) return undefined;
    let cancelled = false;

    (async () => {
      if (mapObj.current.activeLayer) {
        map.removeLayer(mapObj.current.activeLayer);
        mapObj.current.activeLayer = null;
      }
      if (mapObj.current.recentLayer) {
        map.removeLayer(mapObj.current.recentLayer);
        mapObj.current.recentLayer = null;
      }
      if (mapObj.current.fireLayer) {
        map.removeLayer(mapObj.current.fireLayer);
        mapObj.current.fireLayer = null;
      }
      mapObj.current.waterMarkers.forEach((m) => map.removeLayer(m));
      mapObj.current.waterMarkers = [];

      const filters = { dateStart, dateEnd, month, year };

      if (viewMode === 'sightings' || viewMode === 'maintenance' || viewMode === 'incidents') {
        const category = CATEGORY_MAP[viewMode];
        const filtered = allObservations.filter((o) => {
          if ((o.category || '').toLowerCase() !== category) return false;
          if (o.latitude == null || o.longitude == null) return false;
          if (!withinDateFilters(o.timestamp, filters)) return false;
          if (viewMode === 'sightings' && species && (o.animal || '').toLowerCase() !== species.toLowerCase()) return false;
          return true;
        });

        const effectiveDisplayMode = viewMode === 'sightings' ? displayMode : 'actual';

        if (effectiveDisplayMode === 'hotspot') {
          await ensureHeatPlugin(L);
          if (cancelled) return;
          const points = filtered.map((o) => [o.latitude, o.longitude, 1]);
          if (points.length > 0) {
            mapObj.current.activeLayer = L.heatLayer(points, { radius: 25, blur: 15, maxZoom: 17, minOpacity: 0.6 }).addTo(map);
          }
        } else {
          const markers = filtered.map((o) => {
            const color = viewMode === 'sightings' ? colorForLabel(o.animal) : CATEGORY_COLOR[category];
            const marker = L.marker([o.latitude, o.longitude], { icon: dotIcon(L, color) });
            marker.bindPopup(popupHtml(o));
            return marker;
          });
          mapObj.current.activeLayer = L.layerGroup(markers).addTo(map);
        }

        if (showRecent) {
          const oneWeekAgo = dayjs().subtract(7, 'day');
          const recentMarkers = allObservations
            .filter((o) => (o.category || '').toLowerCase() === category && o.latitude != null && o.longitude != null && dayjs(o.timestamp).isAfter(oneWeekAgo))
            .map((o) => {
              const marker = L.marker([o.latitude, o.longitude], { icon: recentPinIcon(L) });
              marker.bindPopup(`<strong>🕐 RECENT ${RECENT_LABEL[viewMode]} (This Week)</strong><br>${popupHtml(o)}`);
              return marker;
            });
          mapObj.current.recentLayer = L.layerGroup(recentMarkers).addTo(map);
        }

        setTotal(filtered.length);
      } else if (viewMode === 'trees') {
        const filtered = allTrees.filter((t) => {
          if (t.latitude == null || t.longitude == null) return false;
          if (treeType && (t.species || '').toLowerCase() !== treeType.toLowerCase()) return false;
          return true;
        });

        if (displayMode === 'hotspot') {
          await ensureHeatPlugin(L);
          if (cancelled) return;
          const points = filtered.map((t) => [t.latitude, t.longitude, 1]);
          if (points.length > 0) {
            mapObj.current.activeLayer = L.heatLayer(points, { radius: 25, blur: 15, maxZoom: 17, minOpacity: 0.6 }).addTo(map);
          }
        } else {
          const markers = filtered.map((t) => {
            const marker = L.marker([t.latitude, t.longitude], { icon: dotIcon(L, colorForLabel(t.species)) });
            const status = t.wrappedHistory?.length ? t.wrappedHistory[t.wrappedHistory.length - 1].status : 'Unknown';
            marker.bindPopup(
              `<strong>${escapeHtml(t.species || 'Tree')}</strong><br>Status: ${escapeHtml(status)}<br>DBH readings: ${
                t.dbhHistory?.length || 0
              }`
            );
            return marker;
          });
          mapObj.current.activeLayer = L.layerGroup(markers).addTo(map);
        }
        setTotal(filtered.length);
      } else if (viewMode === 'water-quality') {
        const markers = Object.entries(WATER_LOCATIONS).map(([key, loc]) => {
          const marker = L.marker(loc.coords, { icon: dotIcon(L, '#1e90ff', 16) });
          marker.bindPopup(
            `<strong>${escapeHtml(loc.name)}</strong><br><em>Water Quality Location</em><br><button onclick="window.__kprShowWaterTrends('${key}')" style="margin-top:6px;cursor:pointer;">View Trends</button>`
          );
          marker.addTo(map);
          return marker;
        });
        mapObj.current.waterMarkers = markers;
      } else if (viewMode === 'fires') {
        const filtered = fires.filter((f) => !fireSensor || f.properties?.sensor === fireSensor);
        const markers = filtered
          .filter((f) => f.geometry?.coordinates)
          .map((f) => {
            const [lng, lat] = f.geometry.coordinates;
            const isViirs = f.properties?.sensor === 'VIIRS';
            const marker = L.circleMarker([lat, lng], {
              radius: isViirs ? 6 : 5,
              color: isViirs ? 'red' : 'orange',
              fillColor: isViirs ? 'red' : 'orange',
              fillOpacity: isViirs ? 0.8 : 0.7,
              weight: 2,
            });
            const baseHtml = `<strong>${escapeHtml(f.properties?.sensor || 'Unknown')} Fire Detection</strong><br>Confidence: ${escapeHtml(
              f.properties?.confidence ?? 'N/A'
            )}%<br>FRP: ${escapeHtml(f.properties?.frp ?? 'N/A')} MW<br>Date: ${escapeHtml(f.properties?.acq_date ?? 'N/A')}`;
            marker.bindPopup(baseHtml);
            attachWeatherPopup(marker, lat, lng, baseHtml);
            return marker;
          });
        mapObj.current.fireLayer = L.layerGroup(markers).addTo(map);
        setTotal(filtered.length);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewMode, dateStart, dateEnd, month, year, species, treeType, displayMode, showRecent, allObservations, allTrees, fires, fireSensor]);

  const loadFires = useCallback(async () => {
    setFiresLoading(true);
    setFiresError(null);
    try {
      const res = await apiFetch(`/api/fires?days=${fireDays}`);
      setFires(res.features || []);
    } catch (e) {
      setFires([]);
      setFiresError(e.message || 'Failed to load fire data');
    } finally {
      // Mark attempted even on failure so we don't infinite-retry on every render.
      setFiresLoaded(true);
      setFiresLoading(false);
    }
  }, [fireDays]);

  useEffect(() => {
    if (viewMode === 'fires' && !firesLoaded && !firesLoading) {
      loadFires();
    }
  }, [viewMode, firesLoaded, firesLoading, loadFires]);

  useEffect(() => {
    if (viewMode !== 'fires') return;
    setFiresLoaded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fireDays]);

  async function handleSubmitWater() {
    if (!waterLocation) return;
    if (!waterForm.date) {
      alert('Please select a date');
      return;
    }
    const hasData = ['cond', 'tds', 'as', 'cr', 'cu', 'mn', 'na', 'pb'].some((k) => waterForm[k] !== undefined && waterForm[k] !== '');
    if (!hasData) {
      alert('Please enter at least one water quality parameter');
      return;
    }
    setWaterSubmitting(true);
    try {
      const loc = WATER_LOCATIONS[waterLocation];
      await apiFetch('/api/water-monitoring', {
        method: 'POST',
        body: JSON.stringify({
          location: waterLocation,
          location_name: loc.name,
          latitude: loc.coords[0],
          longitude: loc.coords[1],
          date: waterForm.date,
          cond: waterForm.cond ? parseFloat(waterForm.cond) : null,
          tds: waterForm.tds ? parseFloat(waterForm.tds) : null,
          as: waterForm.as ? parseFloat(waterForm.as) : null,
          cr: waterForm.cr ? parseFloat(waterForm.cr) : null,
          cu: waterForm.cu ? parseFloat(waterForm.cu) : null,
          mn: waterForm.mn ? parseFloat(waterForm.mn) : null,
          na: waterForm.na ? parseFloat(waterForm.na) : null,
          pb: waterForm.pb ? parseFloat(waterForm.pb) : null,
          user: user?.displayName || user?.email || user?.phoneNumber || user?.uid || '',
        }),
      });
      alert('Water quality data submitted successfully!');
      setWaterForm({});
    } catch (e) {
      alert('Failed to submit water quality data: ' + e.message);
    } finally {
      setWaterSubmitting(false);
    }
  }

  if (!authorized) return null;

  const totalLabel = { sightings: 'Total Sightings', trees: 'Total Trees', maintenance: 'Total Maintenance', incidents: 'Total Incidents' }[
    viewMode
  ];

  return (
    <AppShell title="Concession Map">
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-160px)]">
        <div className="relative flex-1 min-w-0 rounded-portal-lg overflow-hidden border border-portal-border">
          <LeafletMap onReady={handleReady} />
          <MapLegend items={LEGEND_ITEMS.map((i) => ({ ...i, checked: toggles[i.key] }))} onToggle={(k) => setToggles((t) => ({ ...t, [k]: !t[k] }))} />
          {loading && (
            <div className="absolute bottom-3 left-3 z-[500] kpr-card px-3.5 py-2 text-xs text-portal-text-muted">Loading layers…</div>
          )}
          {error && <div className="absolute bottom-3 left-3 z-[500] kpr-card px-3.5 py-2 text-xs text-portal-danger">{error}</div>}
          {viewMode === 'fires' && firesError && (
            <div className="absolute bottom-3 left-3 z-[500] kpr-card px-3.5 py-2 text-xs text-portal-danger">{firesError}</div>
          )}
          {viewMode === 'water-monitoring' && mapReady.map && mapReady.L && (
            <WaterExtentSlider map={mapReady.map} L={mapReady.L} />
          )}
        </div>

        <MapFilterPanel
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          dateStart={dateStart}
          dateEnd={dateEnd}
          onDateStartChange={setDateStart}
          onDateEndChange={setDateEnd}
          month={month}
          year={year}
          onMonthChange={setMonth}
          onYearChange={setYear}
          species={species}
          onSpeciesChange={setSpecies}
          speciesOptions={speciesOptions}
          treeType={treeType}
          onTreeTypeChange={setTreeType}
          treeOptions={treeOptions}
          displayMode={displayMode}
          onDisplayModeChange={setDisplayMode}
          showRecent={showRecent}
          onShowRecentChange={setShowRecent}
          total={total}
          totalLabel={totalLabel}
          waterLocation={waterLocation}
          onWaterLocationChange={setWaterLocation}
          waterForm={waterForm}
          onWaterFormChange={(key, value) => setWaterForm((f) => ({ ...f, [key]: value }))}
          onSubmitWater={handleSubmitWater}
          waterSubmitting={waterSubmitting}
          fireSensor={fireSensor}
          onFireSensorChange={setFireSensor}
          fireDays={fireDays}
          onFireDaysChange={setFireDays}
          fireCount={fires.filter((f) => !fireSensor || f.properties?.sensor === fireSensor).length}
          onRefreshFires={loadFires}
          firesLoading={firesLoading}
        />
      </div>

      {waterTrendsFor && <WaterTrendsModal locationKey={waterTrendsFor} onClose={() => setWaterTrendsFor(null)} />}
    </AppShell>
  );
}

const CATEGORY_COLOR = { sighting: '#526b38', incident: '#b42318', maintenance: '#c9a96b' };
