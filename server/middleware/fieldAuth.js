/**
 * Field / portal auth middleware — Firebase ID token required.
 *
 * On success, attaches (never trust body.role / body.user for identity):
 *   req.authMethod = 'firebase'
 *   req.firebaseUser = decoded token
 *   req.authUid = uid
 *   req.authRole = role from Firestore users/{uid} (normalized)
 *   req.authStatus = status from Firestore
 */
const admin = require('firebase-admin');

function normalizeRole(role) {
  const r = String(role || '')
    .toLowerCase()
    .trim();
  if (r === 'user') return 'guide';
  if (r === 'viewer') return 'guest';
  if (['admin', 'guide', 'guest', 'researcher'].includes(r)) return r;
  return 'guest';
}

function clearAuthIdentity(req) {
  req.authMethod = null;
  req.firebaseUser = null;
  req.authUid = null;
  req.authRole = null;
  req.authStatus = null;
}

/**
 * Verify Bearer token and load uid/role/status from Firestore.
 * @returns {{ ok: true, decoded, uid, role, status } | { ok: false, code, message }}
 */
async function resolveFirebaseAuth(db, token) {
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    let status = 'active';
    let role = 'guest';

    if (db) {
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      if (userDoc.exists) {
        const data = userDoc.data() || {};
        status = String(data.status || 'active').toLowerCase();
        role = normalizeRole(data.role || 'guest');
      }
    }

    if (status === 'revoked') {
      return {
        ok: false,
        code: 403,
        message: 'Your account has been suspended',
      };
    }

    return { ok: true, decoded, uid: decoded.uid, role, status };
  } catch (err) {
    console.error('Firebase token verify failed:', err.message);
    return {
      ok: false,
      code: 401,
      message: 'Invalid or expired session — sign in again',
    };
  }
}

function attachFirebaseAuth(req, resolved) {
  req.authMethod = 'firebase';
  req.firebaseUser = resolved.decoded;
  req.authUid = resolved.uid;
  req.authRole = resolved.role;
  req.authStatus = resolved.status;
}

function extractBearer(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return '';
  return authHeader.slice(7).trim();
}

/** Require a valid Firebase Bearer token. */
function createFieldAuth(db) {
  return async function requireFieldAuth(req, res, next) {
    clearAuthIdentity(req);

    const token = extractBearer(req);
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Sign in required',
      });
    }

    const resolved = await resolveFirebaseAuth(db, token);
    if (!resolved.ok) {
      return res.status(resolved.code).json({
        error: resolved.code === 403 ? 'Forbidden' : 'Unauthorized',
        message: resolved.message,
      });
    }

    attachFirebaseAuth(req, resolved);
    return next();
  };
}

module.exports = {
  createFieldAuth,
  resolveFirebaseAuth,
  normalizeRole,
  extractBearer,
  attachFirebaseAuth,
  clearAuthIdentity,
};
