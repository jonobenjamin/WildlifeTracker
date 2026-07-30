'use server';

import { getAdmin, getAdminDb } from '@/lib/firebase/admin';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_ITEMS, ALL_ITEMS_VALUE } from '@/lib/notificationCatalog';

const COLLECTION = 'notificationRules';

function toIso(value) {
  if (!value) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  return value;
}

export async function listNotificationRules() {
  try {
    const db = getAdminDb();
    let snap;
    try {
      snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
    } catch {
      snap = await db.collection(COLLECTION).get();
    }

    const rules = snap.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        category: d.category,
        items: Array.isArray(d.items) ? d.items : [],
        userIds: Array.isArray(d.userIds) ? d.userIds : [],
        enabled: d.enabled !== false,
        createdAt: toIso(d.createdAt),
        updatedAt: toIso(d.updatedAt),
      };
    });

    return { success: true, rules };
  } catch (error) {
    console.error('listNotificationRules failed:', error);
    throw new Error(error.message || 'Failed to load notification rules');
  }
}

export async function createNotificationRule(input) {
  try {
    const { category, items, userIds } = input || {};
    const validCats = NOTIFICATION_CATEGORIES.map((c) => c.value);
    if (!validCats.includes(category)) throw new Error('Invalid submission type');

    const itemList = Array.isArray(items) ? items.map(String).filter(Boolean) : [];
    const userList = Array.isArray(userIds) ? userIds.map(String).filter(Boolean) : [];
    if (userList.length === 0) throw new Error('Select at least one user');

    const allowed = NOTIFICATION_ITEMS[category] || [];
    const normalizedItems =
      itemList.includes(ALL_ITEMS_VALUE) || itemList.length === 0
        ? [ALL_ITEMS_VALUE]
        : itemList.filter((i) => allowed.includes(i) || i === ALL_ITEMS_VALUE);

    if (normalizedItems.length === 0) throw new Error('Select at least one sub-item');

    const db = getAdminDb();
    const admin = getAdmin();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const ref = await db.collection(COLLECTION).add({
      category,
      items: normalizedItems,
      userIds: userList,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      createdBy: 'dashboard',
    });

    return { success: true, id: ref.id };
  } catch (error) {
    console.error('createNotificationRule failed:', error);
    throw new Error(error.message || 'Failed to create notification rule');
  }
}

export async function deleteNotificationRule(ruleId) {
  try {
    if (!ruleId) throw new Error('Rule id is required');
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(ruleId);
    const doc = await ref.get();
    if (!doc.exists) throw new Error('Rule not found');
    await ref.delete();
    return { success: true, id: ruleId };
  } catch (error) {
    console.error('deleteNotificationRule failed:', error);
    throw new Error(error.message || 'Failed to delete notification rule');
  }
}

export async function setNotificationRuleEnabled(ruleId, enabled) {
  try {
    if (!ruleId) throw new Error('Rule id is required');
    const db = getAdminDb();
    const admin = getAdmin();
    const ref = db.collection(COLLECTION).doc(ruleId);
    const doc = await ref.get();
    if (!doc.exists) throw new Error('Rule not found');
    await ref.update({
      enabled: !!enabled,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, id: ruleId, enabled: !!enabled };
  } catch (error) {
    console.error('setNotificationRuleEnabled failed:', error);
    throw new Error(error.message || 'Failed to update notification rule');
  }
}
