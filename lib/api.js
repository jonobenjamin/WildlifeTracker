// Same-origin API by default — the Express backend now lives in this same
// Next.js app under /api, so no separate host/CORS dance is needed in production.
import { auth } from './firebase/client';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

export function apiUrl(path) {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Build headers for portal → API calls (Firebase Bearer required). */
export async function buildApiHeaders(extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extra,
  };

  const user = auth?.currentUser;
  if (!user) {
    throw new Error('Sign in required');
  }

  const token = await user.getIdToken();
  if (!token) {
    throw new Error('Could not obtain session token — sign in again');
  }
  headers.Authorization = `Bearer ${token}`;

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
