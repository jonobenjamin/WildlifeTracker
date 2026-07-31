const { getDb } = require('../firestoreDb');

const COLLECTION = 'notificationRules';

function normalizeItems(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}

function itemMatches(ruleItems, itemNorm, category) {
  if (!ruleItems.length || ruleItems.includes('*') || ruleItems.some((i) => String(i).trim() === '*')) {
    return true;
  }
  if (!itemNorm) return false;
  return ruleItems.some((i) => {
    const s = String(i).trim().toLowerCase();
    if (!s) return false;
    if (category === 'fire' && s.includes('fire')) return true;
    // Exact match, or either side contains the other (handles slight label drift)
    return s === itemNorm || s.includes(itemNorm) || itemNorm.includes(s);
  });
}

/**
 * Resolve recipient emails for a notification event from Firestore rules.
 * @param {{ category: string, item?: string }} event
 */
async function getRecipientEmailsForEvent({ category, item }) {
  const db = getDb();
  if (!db) {
    console.error('[notifications] Firestore db not ready');
    return [];
  }

  const cat = String(category || '').toLowerCase().trim();
  if (!cat) return [];

  let snap;
  try {
    snap = await db.collection(COLLECTION).get();
  } catch (err) {
    console.error('Failed to load notification rules:', err.message);
    return [];
  }

  const userIds = new Set();
  const itemNorm = String(item || '').trim().toLowerCase();
  let matchedRules = 0;

  for (const doc of snap.docs) {
    const rule = doc.data() || {};
    if (rule.enabled === false) continue;
    if (String(rule.category || '').toLowerCase() !== cat) continue;

    const items = normalizeItems(rule.items);
    if (!itemMatches(items, itemNorm, cat)) continue;

    matchedRules += 1;
    (rule.userIds || []).forEach((id) => {
      if (id) userIds.add(String(id));
    });
  }

  console.log(
    `[notifications] category=${cat} item=${itemNorm || '(none)'} matchedRules=${matchedRules} users=${userIds.size} rulesScanned=${snap.size}`
  );

  if (userIds.size === 0) return [];

  const emails = [];
  await Promise.all(
    [...userIds].map(async (uid) => {
      try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
          console.warn(`[notifications] user doc missing: ${uid}`);
          return;
        }
        const data = userDoc.data() || {};
        if (data.status === 'revoked') return;
        const email = String(data.email || '').trim().toLowerCase();
        if (email) emails.push(email);
        else console.warn(`[notifications] user has no email: ${uid}`);
      } catch (err) {
        console.warn(`Could not resolve user ${uid} for notification:`, err.message);
      }
    })
  );

  return [...new Set(emails)];
}

function envFallbackEmails() {
  if (!process.env.NOTIFICATION_EMAILS) return [];
  return process.env.NOTIFICATION_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = {
  COLLECTION,
  getRecipientEmailsForEvent,
  envFallbackEmails,
};
