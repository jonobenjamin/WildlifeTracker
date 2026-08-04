/**
 * Field PWA auth: accept either the shared API key OR a Firebase ID token
 * for an active (non-revoked) user. Stops sync breaking when the baked
 * Flutter API_KEY drifts from Vercel process.env.API_KEY.
 */
const admin = require('firebase-admin');

function createFieldAuth(db) {
  return async function requireFieldAuth(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (apiKey && process.env.API_KEY && apiKey === process.env.API_KEY) {
      req.authMethod = 'apiKey';
      return next();
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid API key or signed-in session required',
      });
    }

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      let status = 'active';

      if (db) {
        const userDoc = await db.collection('users').doc(decoded.uid).get();
        if (userDoc.exists) {
          status = String((userDoc.data() || {}).status || 'active').toLowerCase();
        }
      }

      if (status === 'revoked') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Your account has been suspended',
        });
      }

      req.authMethod = 'firebase';
      req.firebaseUser = decoded;
      return next();
    } catch (err) {
      console.error('Field auth token verify failed:', err.message);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired session — sign in again',
      });
    }
  };
}

module.exports = { createFieldAuth };
