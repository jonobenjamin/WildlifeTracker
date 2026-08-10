// Same-origin API by default — the Express backend now lives in this same
// Next.js app under /api, so no separate host/CORS dance is needed in production.
import { auth } from './firebase/client';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

export function apiUrl(path) {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Build headers for portal → API calls.
 * Phase 1: send Firebase ID token when signed in (preferred), and keep
 * NEXT_PUBLIC_API_KEY as a migration fallback. Login/PIN pages have no user,
 * so they continue with the shared key only (or no auth for /api/auth/*).
 */
export async function buildApiHeaders(extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    // Migration fallback — do not remove until Phase 2+ clients are updated.
    'x-api-key': process.env.NEXT_PUBLIC_API_KEY || '',
    ...extra,
  };

  try {
    const user = auth?.currentUser;
    if (user) {
      const token = await user.getIdToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch (err) {
    // Keep API-key fallback if token retrieval fails.
    console.warn('apiFetch: could not get Firebase ID token', err?.message || err);
  }

  return headers;
}

export async function apiFetch(path, options = {}) {
  const { headers: optionHeaders, ...rest } = options;
  const headers = await buildApiHeaders(optionHeaders || {});

  const res = await fetch(apiUrl(path), {
    ...rest,
    headers,
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
