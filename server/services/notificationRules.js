const { getDb } = require('../firestoreDb');

const COLLECTION = 'notificationRules';

/**
 * Resolve recipient emails for a notification event from Firestore rules.
 * @param {{ category: string, item?: string }} event
 *   category: sighting | incident | maintenance | fire
 *   item: species / incident type / maintenance type / fire sub-item
 */
async function getRecipientEmailsForEvent({ category, item }) {
  const db = getDb();
  if (!db) return [];

  const cat = String(category || '').toLowerCase().trim();
  if (!cat) return [];

  let snap;
  try {
    // Load all rules then filter in memory (avoids index / enabled-field edge cases).
    snap = await db.collection(COLLECTION).get();
  } catch (err) {
    console.error('Failed to load notification rules:', err.message);
    return [];
  }

  const userIds = new Set();
  const itemNorm = String(item || '').trim().toLowerCase();

  for (const doc of snap.docs) {
    const rule = doc.data() || {};
    if (rule.enabled === false) continue;
    if (String(rule.category || '').toLowerCase() !== cat) continue;

    const items = Array.isArray(rule.items) ? rule.items : [];
    const matchesAll = items.length === 0 || items.includes('*');
    const matchesItem =
      itemNorm &&
      items.some((i) => {
        const s = String(i).trim().toLowerCase();
        // Fire rules: any fire-area wording matches
        if (cat === 'fire' && s.includes('fire')) return true;
        return s === itemNorm;
      });

    if (!matchesAll && !matchesItem) continue;
    (rule.userIds || []).forEach((id) => {
      if (id) userIds.add(String(id));
    });
  }

  console.log(
    `[notifications] category=${cat} item=${itemNorm || '(none)'} matchedUsers=${userIds.size} rulesScanned=${snap.size}`
  );

  if (userIds.size === 0) return [];

  const emails = [];
  await Promise.all(
    [...userIds].map(async (uid) => {
      try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) return;
        const data = userDoc.data() || {};
        if (data.status === 'revoked') return;
        const email = String(data.email || '').trim().toLowerCase();
        if (email) emails.push(email);
      } catch (err) {
        console.warn(`Could not resolve user ${uid} for notification:`, err.message);
      }
    })
  );

  return [...new Set(emails)];
}

/**
 * Fallback env list (legacy). Used only when no rules match AND env is set.
 */
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
