'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithCustomToken,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase/client';
import { apiUrl } from './api';

const AuthContext = createContext(null);

function profileFromDoc(uid, data = {}) {
  return {
    uid,
    name: data.name || '',
    email: data.email || '',
    phone: data.phone || '',
    role: data.role || 'viewer',
    status: data.status || 'active',
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!auth) {
      // SSR / missing client Firebase — mark ready so pages can render
      setReady(true);
      return undefined;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setProfile(null);
        setRole(null);
        setReady(true);
        return;
      }
      setUser(u);
      try {
        if (!db) throw new Error('Firestore not available');
        const snap = await getDoc(doc(db, 'users', u.uid));
        if (snap.exists()) {
          const data = snap.data();
          const next = profileFromDoc(u.uid, data);
          setProfile(next);
          setRole(data.status === 'revoked' ? null : data.role || 'viewer');
          // Keep Auth displayName in sync so other Firebase clients see the name too
          if (next.name && u.displayName !== next.name) {
            updateProfile(u, { displayName: next.name }).catch(() => {});
          }
        } else {
          const fallback = {
            uid: u.uid,
            name: u.displayName || '',
            email: u.email || '',
            phone: u.phoneNumber || '',
            role: 'viewer',
            status: 'active',
          };
          setProfile(fallback);
          setRole('viewer');
        }
      } catch (e) {
        console.error('Failed to resolve profile:', e);
        setProfile({
          uid: u.uid,
          name: u.displayName || '',
          email: u.email || '',
          phone: u.phoneNumber || '',
          role: 'viewer',
          status: 'active',
        });
        setRole('viewer');
      }
      setReady(true);
    });
    return () => unsub();
  }, []);

  const applyLoginProfile = useCallback((data) => {
    const nextRole = data?.role ? String(data.role).toLowerCase() : null;
    if (nextRole) setRole(nextRole);
    if (data?.name || data?.email || data?.role) {
      setProfile((prev) => ({
        uid: auth?.currentUser?.uid || prev?.uid || '',
        name: data.name || prev?.name || '',
        email: data.email || prev?.email || '',
        phone: prev?.phone || '',
        role: nextRole || prev?.role || 'viewer',
        status: 'active',
      }));
    }
  }, []);

  const loginWithPassword = useCallback(async (name, password) => {
    if (!auth) throw new Error('Firebase Auth is not available in this browser');
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    await signInWithCustomToken(auth, data.customToken);
    if (auth.currentUser && data.name) {
      await updateProfile(auth.currentUser, { displayName: data.name }).catch(() => {});
    }
    applyLoginProfile(data);
    await syncUserDoc(data);
    return data;
  }, [applyLoginProfile]);

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
    if (!auth) throw new Error('Firebase Auth is not available in this browser');
    const res = await fetch(apiUrl('/api/auth/verify-pin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, pin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Invalid PIN');
    await signInWithCustomToken(auth, data.customToken);
    if (auth.currentUser && data.name) {
      await updateProfile(auth.currentUser, { displayName: data.name }).catch(() => {});
    }
    applyLoginProfile({ ...data, email });
    await syncUserDoc({ ...data, email });
    return data;
  }, [applyLoginProfile]);

  const signOut = useCallback(async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, role, ready, loginWithPassword, requestPin, signInWithPin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

async function syncUserDoc(data) {
  if (!auth || !db) return;
  const user = auth.currentUser;
  if (!user) return;
  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const prev = snap.exists() ? snap.data() : {};
    const role = (data.role || prev.role || 'viewer').toString().toLowerCase();
    await setDoc(
      userRef,
      {
        uid: user.uid,
        name: data.name || prev.name || '',
        ...(prev.email || data.email
          ? { email: String(data.email || prev.email || '').toLowerCase() }
          : {}),
        role,
        status: prev.status || 'active',
        lastLogin: serverTimestamp(),
      },
      { merge: true }
    );
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
  const { user, profile, role, ready } = useAuth();
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

  return {
    user,
    profile,
    role,
    ready,
    authorized: !!user && !!role && (!allow || allow.includes(role)),
  };
}
