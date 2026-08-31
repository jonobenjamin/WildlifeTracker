'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchCatalog, fetchNdviPngBlobUrl } from '@/lib/okavangoNdvi';

/**
 * Shows only the latest published Okavango NDVI raster on the map.
 * Used when the sidebar legend "NDVI" toggle is on (not the historical slider).
 */
export default function LatestNdviOverlay({ map, L, enabled }) {
  const overlayRef = useRef(null);
  const urlRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function clearOverlay() {
      if (overlayRef.current && map) {
        map.removeLayer(overlayRef.current);
        overlayRef.current = null;
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    }

    (async () => {
      if (!enabled || !map || !L) {
        await clearOverlay();
        return;
      }
      setError(null);
      try {
        const catalog = await fetchCatalog();
        if (cancelled) return;
        const dates = catalog.dates || [];
        const latest = catalog.latest || dates[dates.length - 1];
        if (!latest || !catalog.bounds) {
          setError('No NDVI image available.');
          await clearOverlay();
          return;
        }
        const url = await fetchNdviPngBlobUrl(latest);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        await clearOverlay();
        urlRef.current = url;
        overlayRef.current = L.imageOverlay(url, catalog.bounds, { opacity: 0.85 }).addTo(map);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Failed to load NDVI image');
          await clearOverlay();
        }
      }
    })();

    return () => {
      cancelled = true;
      if (overlayRef.current && map) {
        try {
          map.removeLayer(overlayRef.current);
        } catch {
          /* map may already be gone */
        }
        overlayRef.current = null;
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [enabled, map, L]);

  if (!enabled || !error) return null;

  return (
    <div className="absolute bottom-3 left-3 z-[500] kpr-card px-3.5 py-2 text-xs text-portal-danger max-w-xs">
      {error}
    </div>
  );
}
