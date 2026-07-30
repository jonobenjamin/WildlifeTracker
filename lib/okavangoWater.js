// Client helper for the Okavango Water "water extent" raster overlay feature.
// Talks to our own /api/okavango-water/* proxy (server holds the real partner
// API key) using the same shared x-api-key this app already uses everywhere else.
import { apiUrl } from './api';

function headers() {
  return { 'x-api-key': process.env.NEXT_PUBLIC_API_KEY || '' };
}

export async function fetchCatalog(date) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(apiUrl(`/api/okavango-water/catalog${qs}`), { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Failed to load water extent catalog (${res.status})`);
  return data;
}

export async function fetchWaterPngBlobUrl(date) {
  const res = await fetch(apiUrl(`/api/okavango-water/image?date=${encodeURIComponent(date)}`), { headers: headers() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Failed to load water extent image (${res.status})`);
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
