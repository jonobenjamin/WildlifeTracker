/** Portal / field user roles (stored lowercase in Firestore). */

export const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'guide', label: 'Guide' },
  { value: 'guest', label: 'Guest' },
  { value: 'researcher', label: 'Researcher' },
];

export const VALID_ROLES = ROLE_OPTIONS.map((r) => r.value);

/** Roles allowed to use the web portal (not Guest). */
export const WEB_ROLES = ['admin', 'guide', 'researcher'];

export const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));

/**
 * Normalize role strings, including legacy portal values.
 * user → guide, viewer → guest
 */
export function normalizeRole(role) {
  const r = String(role || '')
    .toLowerCase()
    .trim();
  if (r === 'user') return 'guide';
  if (r === 'viewer') return 'guest';
  if (VALID_ROLES.includes(r)) return r;
  return 'guest';
}

export function canAccessWeb(role) {
  return WEB_ROLES.includes(normalizeRole(role));
}

export function homePathForRole(role) {
  const r = normalizeRole(role);
  if (r === 'admin' || r === 'guide' || r === 'researcher') return '/map';
  return '/login';
}

export function labelForRole(role) {
  const r = normalizeRole(role);
  return ROLE_LABELS[r] || r;
}

/** Concession map view modes allowed per role. null = all modes. */
export const MAP_VIEWS_BY_ROLE = {
  admin: null,
  researcher: ['sightings', 'trees', 'water-quality', 'water-monitoring', 'fires'],
  guide: ['sightings'],
  guest: [],
};

export function allowedMapViews(role) {
  const r = normalizeRole(role);
  return MAP_VIEWS_BY_ROLE[r] === null ? null : MAP_VIEWS_BY_ROLE[r] || [];
}

export function isMapViewAllowed(role, viewMode) {
  const allowed = allowedMapViews(role);
  if (allowed === null) return true;
  return allowed.includes(viewMode);
}
