/**
 * `admin.firestore()` always returns the `(default)` database, regardless of
 * any `.settings({ databaseId })` call — that option isn't part of the
 * supported FirestoreSettings API and is silently ignored on modern
 * firebase-admin versions. This project only has a named database
 * (FIREBASE_DATABASE_ID, default 'wildlifetracker-db') and no `(default)`
 * database, so every route must fetch Firestore through this helper instead
 * of calling `admin.firestore()` directly.
 */
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

function getDb() {
  return getFirestore(admin.app(), process.env.FIREBASE_DATABASE_ID || 'wildlifetracker-db');
}

module.exports = { getDb };
