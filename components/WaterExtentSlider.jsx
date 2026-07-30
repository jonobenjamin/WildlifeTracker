'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCatalog, fetchWaterPngBlobUrl, formatCatalogDate } from '@/lib/okavangoWater';

const SPEED_OPTIONS = [
  { value: 1200, label: '1×' },
  { value: 500, label: '3×' },
  { value: 250, label: '5×' },
];

/**
 * Historical Okavango Delta water-extent overlay: fetches the partner's published
 * date catalog once, then lets the user scrub a slider through PNG raster frames
 * (blue wet-cell overlays), swapped in-place on the Leaflet map passed in via props.
 */
export default function WaterExtentSlider({ map, L }) {
  const [dates, setDates] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [frameLoading, setFrameLoading] = useState(false);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1200);

  const overlayRef = useRef(null);
  const boundsRef = useRef(null);
  const urlCacheRef = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const catalog = await fetchCatalog();
        if (cancelled) return;
        const allDates = catalog.dates || [];
        boundsRef.current = catalog.bounds;
        setDates(allDates);
        const latestIdx = catalog.latest ? allDates.indexOf(catalog.latest) : allDates.length - 1;
        setIndex(latestIdx >= 0 ? latestIdx : Math.max(allDates.length - 1, 0));
        if (allDates.length === 0) setError('No published water extent dates yet.');
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showFrame = useCallback(
    async (i) => {
      if (!dates.length || !map || !L || !boundsRef.current) return;
      const date = dates[i];
      if (!date) return;
      setFrameLoading(true);
      setError(null);
      try {
        let url = urlCacheRef.current.get(date);
        if (!url) {
          url = await fetchWaterPngBlobUrl(date);
          urlCacheRef.current.set(date, url);
        }
        if (overlayRef.current) map.removeLayer(overlayRef.current);
        overlayRef.current = L.imageOverlay(url, boundsRef.current, { opacity: 0.85 }).addTo(map);

        [i - 1, i + 1].forEach(async (ni) => {
          const nd = dates[ni];
          if (nd && !urlCacheRef.current.has(nd)) {
            try {
              const nUrl = await fetchWaterPngBlobUrl(nd);
              urlCacheRef.current.set(nd, nUrl);
            } catch {
              // best-effort prefetch only
            }
          }
        });
      } catch (e) {
        setError(e.message);
      } finally {
        setFrameLoading(false);
      }
    },
    [dates, map, L]
  );

  useEffect(() => {
    if (!loading && dates.length > 0) showFrame(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, loading, dates.length]);

  useEffect(() => {
    return () => {
      if (overlayRef.current && map) map.removeLayer(overlayRef.current);
      urlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlCacheRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    if (!playing || dates.length < 2) return undefined;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1 >= dates.length ? 0 : i + 1));
    }, speed);
    return () => clearInterval(timer);
  }, [playing, speed, dates.length]);

  if (loading) {
    return (
      <div className="absolute left-3 right-3 bottom-3 z-[500] kpr-card px-4 py-3 text-xs text-portal-text-muted">
        Loading Okavango water extent catalog…
      </div>
    );
  }

  if (dates.length === 0) {
    return (
      <div className="absolute left-3 right-3 bottom-3 z-[500] kpr-card px-4 py-3 text-xs text-portal-danger">
        {error || 'No water extent data available.'}
      </div>
    );
  }

  return (
    <div className="absolute left-3 right-3 bottom-3 z-[500] kpr-card px-4 py-3">
      <div className="flex items-center gap-3">
        <button className="kpr-btn !px-3 !py-1.5 text-xs" onClick={() => setPlaying((p) => !p)} disabled={dates.length < 2}>
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(dates.length - 1, 0)}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
          className="flex-1 accent-kpr-green-light"
          disabled={dates.length < 2}
        />
        <select
          className="kpr-input !w-auto !py-1.5 text-xs"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          disabled={dates.length < 2}
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="text-xs font-semibold whitespace-nowrap w-28 text-right">
          {frameLoading ? 'Loading…' : formatCatalogDate(dates[index])}
        </span>
      </div>
      {error && <p className="text-xs text-portal-danger mt-2">{error}</p>}
    </div>
  );
}
