import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

function init() {
  if (admin.apps.length) return admin;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable not set!');
  }
  let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
  if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
    jsonString = jsonString.slice(1, -1);
  }
  jsonString = jsonString.replace(/\\"/g, '"');
  const serviceAccount = JSON.parse(jsonString);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || 'wildlifetracker-4d28b'}.firebaseio.com`,
    storageBucket: `${process.env.FIREBASE_PROJECT_ID || 'wildlifetracker-4d28b'}.firebasestorage.app`,
  });
  return admin;
}

export function getAdmin() {
  return init();
}

export function getAdminDb() {
  const a = init();
  // `a.firestore()` always returns the `(default)` database; this project only
  // has a named database, so we must fetch it via getFirestore(app, databaseId).
  return getFirestore(a.app(), process.env.FIREBASE_DATABASE_ID || 'wildlifetracker-db');
}
