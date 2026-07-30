'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithCustomToken,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase/client';
import { apiUrl } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setRole(null);
        setReady(true);
        return;
      }
      setUser(u);
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        if (snap.exists()) {
          const data = snap.data();
          setRole(data.status === 'revoked' ? null : data.role || 'viewer');
        } else {
          setRole('viewer');
        }
      } catch (e) {
        console.error('Failed to resolve role:', e);
        setRole('viewer');
      }
      setReady(true);
    });
    return () => unsub();
  }, []);

  const loginWithPassword = useCallback(async (name, password) => {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    await signInWithCustomToken(auth, data.customToken);
    await syncUserDoc(data);
    return data;
  }, []);

  const requestPin = useCallback(async (email, name) => {
    const res = await fetch(apiUrl('/api/auth/request-pin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to send PIN');
    return data;
  }, []);

  const signInWithPin = useCallback(async (email, pin) => {
    const res = await fetch(apiUrl('/api/auth/verify-pin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, pin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Invalid PIN');
    await signInWithCustomToken(auth, data.customToken);
    await syncUserDoc({ ...data, email });
    return data;
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, ready, loginWithPassword, requestPin, signInWithPin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

async function syncUserDoc(data) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const base = {
      uid: user.uid,
      name: data.name || (snap.exists() ? snap.data().name : '') || '',
      lastLogin: serverTimestamp(),
    };
    if (snap.exists()) {
      const prev = snap.data();
      await setDoc(
        userRef,
        { ...base, ...(prev.email ? { email: prev.email } : {}), ...(data.email ? { email: String(data.email).toLowerCase() } : {}) },
        { merge: true }
      );
    } else {
      await setDoc(userRef, { ...base, ...(data.email ? { email: String(data.email).toLowerCase() } : {}), role: 'viewer', status: 'active' }, { merge: true });
    }
  } catch (e) {
    console.warn('Could not sync user doc:', e);
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * Client-side route guard. Redirects to /login if unauthenticated, or to
 * the viewer map if the signed-in role isn't in `allow`.
 */
export function useRequireRole(allow) {
  const { user, role, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user || !role) {
      router.replace('/login');
      return;
    }
    if (allow && !allow.includes(role)) {
      router.replace('/map-users');
    }
  }, [ready, user, role, allow, router]);

  return { user, role, ready, authorized: !!user && !!role && (!allow || allow.includes(role)) };
}
