// Client helper for Okavango NDVI raster overlays.
// Talks to our own /api/okavango-ndvi/* proxy (server holds the partner API key).
import { apiUrl, buildApiHeaders } from './api';

export async function fetchCatalog(date) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(apiUrl(`/api/okavango-ndvi/catalog${qs}`), {
    headers: await buildApiHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Failed to load NDVI catalog (${res.status})`);
  return data;
}

export async function fetchNdviPngBlobUrl(date) {
  const res = await fetch(apiUrl(`/api/okavango-ndvi/image?date=${encodeURIComponent(date)}`), {
    headers: await buildApiHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Failed to load NDVI image (${res.status})`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function formatCatalogDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd || '';
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return new Date(`${y}-${m}-${d}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
