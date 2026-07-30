'use client';

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Public Firebase web config. NEXT_PUBLIC_* wins when set on Vercel; the
 * hardcoded fallbacks match this project's Firebase web app so `next build`
 * / prerender never die with auth/invalid-api-key when env vars are missing
 * at build time. These values are safe to expose in the browser.
 */
const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    'AIzaSyCHpJdRUch5Na_6HgM6dxgWxfoKeciPo_s',
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    'wildlifetracker-4d28b.firebaseapp.com',
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'wildlifetracker-4d28b',
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    'wildlifetracker-4d28b.firebasestorage.app',
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '209541121506',
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    '1:209541121506:web:7fe9890f91be06dc4ba5bb',
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-4XLR7JTEEH',
};

const databaseId =
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || 'wildlifetracker-db';

function getFirebaseApp() {
  // Never touch Auth during SSR / static prerender — that is what broke
  // Vercel builds with auth/invalid-api-key on /map-users etc.
  if (typeof window === 'undefined') return null;
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
    console.error('Firebase web config incomplete');
    return null;
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

function createAuth() {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}

function createDb() {
  const app = getFirebaseApp();
  return app ? getFirestore(app, databaseId) : null;
}

/** Lazily resolved on the client; null during SSR/prerender. */
export const auth = typeof window === 'undefined' ? null : createAuth();
export const db = typeof window === 'undefined' ? null : createDb();

export { getFirebaseApp, firebaseConfig };
