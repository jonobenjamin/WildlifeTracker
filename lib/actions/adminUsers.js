'use server';

import crypto from 'crypto';
import { getAdmin, getAdminDb } from '@/lib/firebase/admin';

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt: salt.toString('hex'), hash };
}

function toIso(value) {
  if (!value) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  return value;
}

/**
 * Dashboard user management talks to Firestore directly (Admin SDK).
 * This avoids the previous self-HTTP loop through /api/admin/* which required
 * ADMIN_API_KEY and often failed on Vercel with a generic Server Components 500.
 */
export async function listUsers() {
  try {
    const db = getAdminDb();
    const admin = getAdmin();

    let usersSnapshot;
    try {
      usersSnapshot = await db.collection('users').orderBy('registeredAt', 'desc').get();
    } catch {
      usersSnapshot = await db.collection('users').get();
    }

    const users = [];
    for (const docSnap of usersSnapshot.docs) {
      const userData = docSnap.data();
      let lastLoginIso = toIso(userData.lastLogin);

      try {
        const authUser = await admin.auth().getUser(docSnap.id);
        const authSignIn = authUser.metadata?.lastSignInTime;
        if (authSignIn) {
          const authMs = new Date(authSignIn).getTime();
          const fsMs = lastLoginIso ? new Date(lastLoginIso).getTime() : 0;
          if (!fsMs || authMs > fsMs) lastLoginIso = new Date(authSignIn).toISOString();
        }
      } catch {
        // No Auth user for this Firestore doc — fine for app/PIN-only accounts
      }

      users.push({
        id: docSnap.id,
        uid: userData.uid,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        role: userData.role || 'user',
        status: userData.status || 'active',
        hasPassword: !!(userData.passwordSalt && userData.passwordHash),
        registeredAt: toIso(userData.registeredAt),
        lastLogin: lastLoginIso,
      });
    }

    return {
      success: true,
      users,
      stats: {
        total: users.length,
        active: users.filter((u) => u.status === 'active').length,
        revoked: users.filter((u) => u.status === 'revoked').length,
      },
    };
  } catch (error) {
    console.error('listUsers failed:', error);
    throw new Error(error.message || 'Failed to fetch users');
  }
}

export async function createUser(input) {
  try {
    const { name, email, phone, password, role } = input || {};
    const identifier = (email || phone || '').toString().trim();
    if (!name || !identifier) throw new Error('Name and email or phone are required');

    const validRoles = ['admin', 'user', 'viewer'];
    const userRole = validRoles.includes(role) ? role : 'user';
    const db = getAdminDb();
    const admin = getAdmin();

    const isEmail = identifier.includes('@');
    const key = isEmail
      ? identifier.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')
      : identifier.replace(/[^0-9a-zA-Z]/g, '_');
    const docId = isEmail ? `email_${key}` : `phone_${key}`;

    const existingDoc = await db.collection('users').doc(docId).get();
    if (existingDoc.exists) throw new Error('A user with this email or phone already exists');

    const userData = {
      uid: docId,
      name: String(name).trim(),
      role: userRole,
      status: 'active',
      registeredAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'dashboard',
    };
    if (isEmail) userData.email = identifier.toLowerCase();
    else userData.phone = identifier;

    if (password && password.length >= 6) {
      const { salt, hash } = hashPassword(password);
      userData.passwordSalt = salt;
      userData.passwordHash = hash;
    }

    await db.collection('users').doc(docId).set(userData);
    return {
      success: true,
      message: 'User created successfully',
      user: { id: docId, name: userData.name, email: userData.email, role: userData.role, status: userData.status },
    };
  } catch (error) {
    console.error('createUser failed:', error);
    throw new Error(error.message || 'Failed to create user');
  }
}

export async function updateUser(userId, input) {
  try {
    if (!userId) throw new Error('User id is required');
    const { name, role, password } = input || {};
    const db = getAdminDb();
    const admin = getAdmin();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new Error('User not found');

    const updates = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'dashboard',
    };
    if (name !== undefined && String(name).trim()) updates.name = String(name).trim();
    if (role !== undefined && ['admin', 'user', 'viewer'].includes(role)) updates.role = role;
    if (password !== undefined) {
      if (password.length >= 6) {
        const { salt, hash } = hashPassword(password);
        updates.passwordSalt = salt;
        updates.passwordHash = hash;
      } else if (password.length === 0) {
        updates.passwordSalt = admin.firestore.FieldValue.delete();
        updates.passwordHash = admin.firestore.FieldValue.delete();
      }
    }

    await userRef.update(updates);
    return { success: true, message: 'User updated successfully', userId };
  } catch (error) {
    console.error('updateUser failed:', error);
    throw new Error(error.message || 'Failed to update user');
  }
}

export async function setUserStatus(userId, status) {
  try {
    if (!userId) throw new Error('User id is required');
    if (!['active', 'revoked'].includes(status)) throw new Error('Invalid status. Must be "active" or "revoked"');
    const db = getAdminDb();
    const admin = getAdmin();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new Error('User not found');

    await userRef.update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'dashboard',
    });
    return {
      success: true,
      message: `User ${status === 'revoked' ? 'revoked' : 'restored'} successfully`,
      userId,
      status,
    };
  } catch (error) {
    console.error('setUserStatus failed:', error);
    throw new Error(error.message || 'Failed to update user status');
  }
}

export async function deleteUser(userId) {
  try {
    if (!userId) throw new Error('User id is required');
    const db = getAdminDb();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new Error('User not found');
    await userRef.delete();
    return { success: true, message: 'User deleted successfully', userId };
  } catch (error) {
    console.error('deleteUser failed:', error);
    throw new Error(error.message || 'Failed to delete user');
  }
}
