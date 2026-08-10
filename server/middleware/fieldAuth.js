/**
 * Field / portal auth middleware.
 *
 * Phase 1: Firebase ID token is preferred. Shared API_KEY remains as a
 * migration fallback so older PWA/APK builds keep working.
 *
 * On Firebase success, attaches (never trust body.role / body.user for identity):
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

function acceptApiKey(req) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  return !!(apiKey && process.env.API_KEY && apiKey === process.env.API_KEY);
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

function attachApiKeyAuth(req) {
  req.authMethod = 'apiKey';
  req.firebaseUser = null;
  req.authUid = null;
  // No identity — callers must not treat this as an authenticated user.
  req.authRole = null;
  req.authStatus = null;
}

function extractBearer(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return '';
  return authHeader.slice(7).trim();
}

/**
 * Preferred: Firebase Bearer. Fallback: shared API_KEY.
 */
function createFieldAuth(db) {
  return async function requireFieldAuth(req, res, next) {
    clearAuthIdentity(req);

    const token = extractBearer(req);
    if (token) {
      const resolved = await resolveFirebaseAuth(db, token);
      if (resolved.ok) {
        attachFirebaseAuth(req, resolved);
        return next();
      }
      // Invalid/expired Bearer: fall through to API key so dual-auth clients
      // (portal sends both) and legacy builds still work during migration.
      if (resolved.code === 403) {
        return res.status(403).json({
          error: 'Forbidden',
          message: resolved.message,
        });
      }
    }

    if (acceptApiKey(req)) {
      attachApiKeyAuth(req);
      return next();
    }

    if (token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired session — sign in again',
      });
    }

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key or signed-in session required',
    });
  };
}

module.exports = {
  createFieldAuth,
  resolveFirebaseAuth,
  normalizeRole,
  extractBearer,
  acceptApiKey,
  attachFirebaseAuth,
  attachApiKeyAuth,
  clearAuthIdentity,
};
