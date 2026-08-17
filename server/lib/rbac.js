/**
 * Phase 2 RBAC helpers.
 *
 * Identity comes only from fieldAuth (Firebase verify + Firestore role/status).
 * Never trust body.user / body.uid / body.role / body.status / body.createdByUid
 * for authorization or ownership.
 *
 * Observations:
 * - Guide/researcher READ = sightings only (Rhino/Pangolin allowed if sighting)
 * - Guide/researcher WRITE = any category, subject to ownership on mutate
 *
 * Trees / roads / tracking:
 * - Guide/researcher/admin READ = full list (operational)
 * - Guest READ = own records only (createdByUid)
 * - Mutate = ownership / admin
 * - Static roads (id static_* or source===static) = admin-only mutate
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

/** Ownership field on observations, trees, and roads. */
function ownerUidFromDoc(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const uid = doc.createdByUid || doc.created_by_uid || null;
  return uid ? String(uid) : null;
}

/** @deprecated use ownerUidFromDoc — kept for observation call sites */
function observationOwnerUid(doc) {
  return ownerUidFromDoc(doc);
}

/**
 * Whether the caller may READ this observation record.
 *
 * Admin: all categories (sighting, incident, maintenance, …), all species.
 * Guide / Researcher: sightings only (Rhino/Pangolin allowed if sighting).
 * Guest (Firebase): own records only (any category they own), via createdByUid.
 * Legacy rows with no createdByUid are not visible to guests.
 */
function canReadObservation(req, doc) {
  const role = normalizeRole(req.authRole);
  const category = normalizeCategory(doc && doc.category);

  if (req.authMethod !== 'firebase' || !req.authUid) {
    return false;
  }

  if (role === 'admin') {
    return true;
  }

  if (role === 'guest') {
    const owner = ownerUidFromDoc(doc);
    return !!(owner && owner === req.authUid);
  }

  // guide, researcher
  return category === 'sighting';
}

function filterObservationsForRead(req, observations) {
  return (observations || []).filter((doc) => canReadObservation(req, doc));
}

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
 * Trees/roads/tracking list READ:
 * - Guest: own records only (createdByUid)
 * - Admin / guide / researcher: full list
 */
function canReadTreeOrRoad(req, doc) {
  if (req.authMethod !== 'firebase' || !req.authUid) return false;
  if (normalizeRole(req.authRole) === 'guest') {
    const owner = ownerUidFromDoc(doc);
    return !!(owner && owner === String(req.authUid));
  }
  return true;
}

/** Tracking READ: admin/guide/researcher see all; guest sees own only. */
function canReadTracking(req, doc) {
  return canReadTreeOrRoad(req, doc);
}

function filterTrackingForRead(req, records) {
  return (records || []).filter((doc) => canReadTracking(req, doc));
}

function filterTreesOrRoadsForRead(req, records) {
  return (records || []).filter((doc) => canReadTreeOrRoad(req, doc));
}

/**
 * Generic ownership mutate (observations, trees, user roads, tracking).
 * Admin: any. Else: createdByUid === authUid.
 * Legacy null createdByUid: admin only.
 */
function canMutateOwnedRecord(req, doc) {
  if (req.authMethod !== 'firebase' || !req.authUid) return false;

  const role = normalizeRole(req.authRole);
  if (role === 'admin') return true;

  const owner = ownerUidFromDoc(doc);
  if (!owner) return false;
  return owner === String(req.authUid);
}

function canMutateObservation(req, doc) {
  return canMutateOwnedRecord(req, doc);
}

function assertCanMutateOwnedRecord(req, res, doc, resourceLabel = 'record') {
  if (canMutateOwnedRecord(req, doc)) return true;
  res.status(403).json({
    success: false,
    error: 'Forbidden',
    message: `You do not have permission to modify this ${resourceLabel}`,
  });
  return false;
}

function assertCanMutateObservation(req, res, doc) {
  return assertCanMutateOwnedRecord(req, res, doc, 'observation');
}

/** Static / system road: id prefix static_ or source === 'static'. */
function isStaticRoad(id, doc) {
  if (String(id || '').startsWith('static_')) return true;
  const source = String((doc && doc.source) || '')
    .toLowerCase()
    .trim();
  return source === 'static';
}

/**
 * Road mutate: static/system → admin only; else ownership rules.
 * For upsert-before-create, pass doc with intended source (may be empty).
 */
function canMutateRoad(req, doc, id) {
  if (isStaticRoad(id, doc)) {
    if (req.authMethod !== 'firebase' || !req.authUid) return false;
    return normalizeRole(req.authRole) === 'admin';
  }
  return canMutateOwnedRecord(req, doc);
}

function assertCanMutateRoad(req, res, doc, id) {
  if (canMutateRoad(req, doc, id)) return true;
  const message = isStaticRoad(id, doc)
    ? 'Only admins can modify static/system roads'
    : 'You do not have permission to modify this road';
  res.status(403).json({
    success: false,
    error: 'Forbidden',
    message,
  });
  return false;
}

/**
 * Server-side ownership stamp for POST create.
 * Firebase → authUid; never derived from body fields.
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
  ownerUidFromDoc,
  observationOwnerUid,
  canReadObservation,
  filterObservationsForRead,
  assertCanReadObservation,
  canReadTreeOrRoad,
  filterTreesOrRoadsForRead,
  canReadTracking,
  filterTrackingForRead,
  canMutateOwnedRecord,
  canMutateObservation,
  assertCanMutateOwnedRecord,
  assertCanMutateObservation,
  isStaticRoad,
  canMutateRoad,
  assertCanMutateRoad,
  resolveCreatedByUidForCreate,
  deletedByFromAuth,
};
