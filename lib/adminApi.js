import 'server-only';

// Server-only helper: talks to our own /api/admin/* Express routes using the
// secret ADMIN_API_KEY, which never gets shipped to the browser. Called from
// Server Actions / Route Handlers only.
function baseUrl() {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

export async function adminApiFetch(path, options = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ADMIN_API_KEY || '',
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Admin request failed (${res.status})`);
  }
  return data;
}
