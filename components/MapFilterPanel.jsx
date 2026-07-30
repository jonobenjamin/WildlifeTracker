'use client';

const MONTHS = [
  ['01', 'January'],
  ['02', 'February'],
  ['03', 'March'],
  ['04', 'April'],
  ['05', 'May'],
  ['06', 'June'],
  ['07', 'July'],
  ['08', 'August'],
  ['09', 'September'],
  ['10', 'October'],
  ['11', 'November'],
  ['12', 'December'],
];

function yearOptions() {
  const current = new Date().getFullYear();
  const years = [];
  for (let y = current + 2; y >= 2020; y--) years.push(y);
  return years;
}

const VIEW_MODES = [
  { value: 'sightings', label: 'Sightings' },
  { value: 'trees', label: 'Trees' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'incidents', label: 'Incidents' },
  { value: 'water-quality', label: 'Water Quality' },
  { value: 'water-monitoring', label: 'Water Monitoring' },
  { value: 'fires', label: 'Fires' },
];

const WATER_LOCATIONS = [
  { value: 'tuludi', label: 'Tuludi' },
  { value: 'sable-alley', label: 'Sable Alley' },
  { value: 'little-sable', label: 'Little Sable' },
];

const WATER_PARAMS = [
  { key: 'cond', label: 'Cond (µS/cm)' },
  { key: 'tds', label: 'TDS (ppm)' },
  { key: 'as', label: 'As (ppm)' },
  { key: 'cr', label: 'Cr (ppm)' },
  { key: 'cu', label: 'Cu (ppm)' },
  { key: 'mn', label: 'Mn (ppm)' },
  { key: 'na', label: 'Na (ppm)' },
  { key: 'pb', label: 'Pb (ppm)' },
];

const VIEW_LABELS = { sightings: 'Sightings', maintenance: 'Maintenance', incidents: 'Incidents' };

export default function MapFilterPanel({
  viewMode,
  onViewModeChange,
  dateStart,
  dateEnd,
  onDateStartChange,
  onDateEndChange,
  month,
  year,
  onMonthChange,
  onYearChange,
  species,
  onSpeciesChange,
  speciesOptions,
  treeType,
  onTreeTypeChange,
  treeOptions,
  displayMode,
  onDisplayModeChange,
  showRecent,
  onShowRecentChange,
  total,
  totalLabel,
  waterLocation,
  onWaterLocationChange,
  waterForm,
  onWaterFormChange,
  onSubmitWater,
  waterSubmitting,
  fireSensor,
  onFireSensorChange,
  fireDays,
  onFireDaysChange,
  fireCount,
  onRefreshFires,
  firesLoading,
}) {
  const showDateFilters = !['trees', 'water-quality', 'water-monitoring', 'fires'].includes(viewMode);
  const showDisplayModeSwitch = viewMode === 'sightings' || viewMode === 'trees';
  const showRecentToggle = ['sightings', 'maintenance', 'incidents'].includes(viewMode);
  const showStat = ['sightings', 'trees', 'maintenance', 'incidents'].includes(viewMode);

  return (
    <div
      className="kpr-card p-5 w-full lg:w-80 flex-shrink-0 space-y-5 overflow-y-auto"
      style={{ maxHeight: 'calc(100vh - 160px)' }}
    >
      <h3 className="text-base font-bold text-portal-text">Filters &amp; Controls</h3>

      <div>
        <h4 className="kpr-label">View Mode</h4>
        <select className="kpr-input" value={viewMode} onChange={(e) => onViewModeChange(e.target.value)}>
          {VIEW_MODES.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {showDateFilters && (
        <>
          <div>
            <h4 className="kpr-label">Date Range</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-portal-text-muted mb-1">Start Date</label>
                <input type="date" className="kpr-input" value={dateStart} onChange={(e) => onDateStartChange(e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] text-portal-text-muted mb-1">End Date</label>
                <input type="date" className="kpr-input" value={dateEnd} onChange={(e) => onDateEndChange(e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <h4 className="kpr-label">Month &amp; Year</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-portal-text-muted mb-1">Month</label>
                <select className="kpr-input" value={month} onChange={(e) => onMonthChange(e.target.value)}>
                  <option value="">All Months</option>
                  {MONTHS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-portal-text-muted mb-1">Year</label>
                <select className="kpr-input" value={year} onChange={(e) => onYearChange(e.target.value)}>
                  <option value="">All Years</option>
                  {yearOptions().map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </>
      )}

      {viewMode === 'sightings' && (
        <div>
          <h4 className="kpr-label">Species Filter</h4>
          <select className="kpr-input" value={species} onChange={(e) => onSpeciesChange(e.target.value)}>
            <option value="">All Species</option>
            {speciesOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {viewMode === 'trees' && (
        <div>
          <h4 className="kpr-label">Tree Filter</h4>
          <select className="kpr-input" value={treeType} onChange={(e) => onTreeTypeChange(e.target.value)}>
            <option value="">All Trees</option>
            {treeOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {showStat && (
        <div className="kpr-card bg-portal-surface-muted p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: 'var(--kpr-green-light)' }}>
            {total}
          </div>
          <div className="text-xs text-portal-text-muted mt-1">{totalLabel}</div>
        </div>
      )}

      {showDisplayModeSwitch && (
        <div>
          <h4 className="kpr-label">Display Mode</h4>
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <span className={`text-xs font-semibold ${displayMode === 'actual' ? 'text-portal-text' : 'text-portal-text-muted'}`}>
              Actual
            </span>
            <span
              role="switch"
              aria-checked={displayMode === 'hotspot'}
              className="relative inline-block w-10 h-5 rounded-full transition"
              style={{ background: displayMode === 'hotspot' ? 'var(--kpr-green-light)' : '#cbd5e1' }}
              onClick={() => onDisplayModeChange(displayMode === 'actual' ? 'hotspot' : 'actual')}
            >
              <span
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: displayMode === 'hotspot' ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </span>
            <span className={`text-xs font-semibold ${displayMode === 'hotspot' ? 'text-portal-text' : 'text-portal-text-muted'}`}>
              Hotspots
            </span>
          </label>
        </div>
      )}

      {showRecentToggle && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="accent-kpr-green-light"
            checked={showRecent}
            onChange={(e) => onShowRecentChange(e.target.checked)}
          />
          <span>Show Recent {VIEW_LABELS[viewMode]} (This Week)</span>
        </label>
      )}

      {viewMode === 'water-monitoring' && (
        <p className="text-xs text-portal-text-muted leading-relaxed">
          Use the slider below the map to scrub through historical Okavango Delta water extent imagery.
        </p>
      )}

      {viewMode === 'water-quality' && (
        <div className="space-y-3">
          <div>
            <h4 className="kpr-label">Location</h4>
            <select className="kpr-input" value={waterLocation} onChange={(e) => onWaterLocationChange(e.target.value)}>
              <option value="">Select Location</option>
              {WATER_LOCATIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          {waterLocation && (
            <div className="space-y-2.5 pt-1 border-t border-portal-border">
              <p className="text-xs text-portal-text-muted pt-2">Click a location marker on the map to view its trend chart.</p>
              {WATER_PARAMS.map((p) => (
                <div key={p.key}>
                  <label className="block text-[11px] text-portal-text-muted mb-1">{p.label}</label>
                  <input
                    type="number"
                    step="0.01"
                    className="kpr-input"
                    value={waterForm[p.key] || ''}
                    onChange={(e) => onWaterFormChange(p.key, e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              ))}
              <div>
                <label className="block text-[11px] text-portal-text-muted mb-1">Date</label>
                <input type="date" className="kpr-input" value={waterForm.date || ''} onChange={(e) => onWaterFormChange('date', e.target.value)} />
              </div>
              <button className="kpr-btn w-full" disabled={waterSubmitting} onClick={onSubmitWater}>
                {waterSubmitting ? 'Submitting…' : 'Submit Water Data'}
              </button>
            </div>
          )}
        </div>
      )}

      {viewMode === 'fires' && (
        <div className="space-y-3">
          <div>
            <h4 className="kpr-label">Sensor Type</h4>
            <select className="kpr-input" value={fireSensor} onChange={(e) => onFireSensorChange(e.target.value)}>
              <option value="">All Sensors</option>
              <option value="VIIRS">VIIRS</option>
              <option value="MODIS">MODIS</option>
            </select>
          </div>
          <div>
            <h4 className="kpr-label">Days Back</h4>
            <select className="kpr-input" value={fireDays} onChange={(e) => onFireDaysChange(e.target.value)}>
              <option value="1">1 Day</option>
              <option value="3">3 Days</option>
            </select>
          </div>
          <div className="kpr-card bg-portal-surface-muted p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: 'var(--kpr-green-light)' }}>
              {fireCount}
            </div>
            <div className="text-xs text-portal-text-muted mt-1">Fires in Okavango Delta</div>
          </div>
          <button className="kpr-btn w-full" disabled={firesLoading} onClick={onRefreshFires}>
            {firesLoading ? 'Refreshing…' : 'Refresh Fire Data'}
          </button>
        </div>
      )}
    </div>
  );
}
