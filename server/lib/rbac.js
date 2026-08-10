/**
 * Phase 2 RBAC helpers for observations.
 *
 * Identity comes only from fieldAuth (Firebase verify + Firestore role/status).
 * Never trust body.user / body.uid / body.role / body.status / body.createdByUid
 * for authorization or ownership.
 *
 * Rhino/Pangolin are NOT a separate ACL — visibility follows observation category
 * (and guest ownership) only.
 *
 * READ vs WRITE:
 * - Guide/researcher READ = sightings only
 * - Guide/researcher WRITE (create/mutate) = any category, subject to ownership on mutate
 */

function normalizeCategory(category) {
  return String(category || '')
    .toLowerCase()
    .trim();
}

function normalizeRole(role) {
  const r = String(role || '')
    .toLowerCase()
    .trim();
  if (r === 'user') return 'guide';
  if (r === 'viewer') return 'guest';
  if (['admin', 'guide', 'guest', 'researcher'].includes(r)) return r;
  return 'guest';
}

function observationOwnerUid(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const uid = doc.createdByUid || doc.created_by_uid || null;
  return uid ? String(uid) : null;
}

/**
 * Whether the caller may READ this observation record.
 *
 * Admin: all categories (sighting, incident, maintenance, …), all species.
 * Guide / Researcher / API key: sightings only (Rhino/Pangolin allowed if sighting).
 * Guest (Firebase): own records only (any category they own), via createdByUid.
 * Legacy rows with no createdByUid are not visible to guests.
 */
function canReadObservation(req, doc) {
  const method = req.authMethod;
  const role = normalizeRole(req.authRole);
  const category = normalizeCategory(doc && doc.category);

  if (method === 'apiKey') {
    return category === 'sighting';
  }

  if (method !== 'firebase' || !req.authUid) {
    return false;
  }

  if (role === 'admin') {
    return true;
  }

  if (role === 'guest') {
    const owner = observationOwnerUid(doc);
    return !!(owner && owner === req.authUid);
  }

  // guide, researcher
  return category === 'sighting';
}

/**
 * Filter a list of observation plain objects (must include category / createdByUid).
 * Does not mutate the input array.
 */
function filterObservationsForRead(req, observations) {
  return (observations || []).filter((doc) => canReadObservation(req, doc));
}

/**
 * Express helper: 403 if the loaded observation is not readable by req.
 * Call after loading the Firestore doc for GET /:id/image (and similar).
 */
function assertCanReadObservation(req, res, doc) {
  if (canReadObservation(req, doc)) return true;
  res.status(403).json({
    success: false,
    error: 'Forbidden',
    message: 'You do not have permission to access this observation',
  });
  return false;
}

/**
 * Whether the caller may PATCH/DELETE this observation.
 *
 * API key: never.
 * Admin (Firebase): any record.
 * Other Firebase roles: req.authUid === createdByUid only.
 * Legacy records with missing/null createdByUid: admin only.
 */
function canMutateObservation(req, doc) {
  if (req.authMethod === 'apiKey') return false;
  if (req.authMethod !== 'firebase' || !req.authUid) return false;

  const role = normalizeRole(req.authRole);
  if (role === 'admin') return true;

  const owner = observationOwnerUid(doc);
  if (!owner) return false;
  return owner === String(req.authUid);
}

function assertCanMutateObservation(req, res, doc) {
  if (canMutateObservation(req, doc)) return true;
  const message =
    req.authMethod === 'apiKey'
      ? 'API key cannot modify or delete observations'
      : 'You do not have permission to modify this observation';
  res.status(403).json({
    success: false,
    error: 'Forbidden',
    message,
  });
  return false;
}

/**
 * Server-side ownership stamp for POST create.
 * Firebase → authUid; API key / no identity → null.
 * Never derived from body fields.
 */
function resolveCreatedByUidForCreate(req) {
  if (req.authMethod === 'firebase' && req.authUid) {
    return String(req.authUid);
  }
  return null;
}

/**
 * deletedBy label from authenticated identity (not request body).
 */
function deletedByFromAuth(req) {
  if (req.authMethod === 'firebase' && req.authUid) {
    return String(req.authUid);
  }
  return 'unknown';
}

module.exports = {
  normalizeCategory,
  normalizeRole,
  observationOwnerUid,
  canReadObservation,
  filterObservationsForRead,
  assertCanReadObservation,
  canMutateObservation,
  assertCanMutateObservation,
  resolveCreatedByUidForCreate,
  deletedByFromAuth,
};
