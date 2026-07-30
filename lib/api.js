// Same-origin API by default — the Express backend now lives in this same
// Next.js app under /api, so no separate host/CORS dance is needed in production.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

export function apiUrl(path) {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      // Same shared key the PWA already ships client-side for these read/write endpoints.
      'x-api-key': process.env.NEXT_PUBLIC_API_KEY || '',
      ...(options.headers || {}),
    },
    ...options,
  });
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const message = (data && data.message) || (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const ADMIN_API_KEY_HEADER = 'x-api-key';
