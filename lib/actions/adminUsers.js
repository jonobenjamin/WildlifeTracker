'use server';

import { adminApiFetch } from '@/lib/adminApi';

export async function listUsers() {
  return adminApiFetch('/api/admin/users');
}

export async function createUser(input) {
  return adminApiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateUser(userId, input) {
  return adminApiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function setUserStatus(userId, status) {
  return adminApiFetch(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteUser(userId) {
  return adminApiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}
