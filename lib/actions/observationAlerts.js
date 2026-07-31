'use server';

import { getAdminDb } from '@/lib/firebase/admin';

function fail(message) {
  return { success: false, error: message || 'Something went wrong' };
}

function normalizeItems(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}

function itemMatches(ruleItems, itemNorm, category) {
  if (
    !ruleItems.length ||
    ruleItems.includes('*') ||
    ruleItems.some((i) => String(i).trim() === '*')
  ) {
    return true;
  }
  if (!itemNorm) return false;
  return ruleItems.some((i) => {
    const s = String(i).trim().toLowerCase();
    if (!s) return false;
    if (category === 'fire' && s.includes('fire')) return true;
    return s === itemNorm || s.includes(itemNorm) || itemNorm.includes(s);
  });
}

function eventFromObservation(obs) {
  const categoryRaw = String(obs.category || '').toLowerCase();
  if (categoryRaw === 'sighting') {
    return {
      category: 'sighting',
      item: obs.animal || obs.species || obs.vulture_species || '',
      heading: 'SIGHTING ALERT',
      subject: `Sighting alert: ${obs.animal || 'Animal'} — KPR`,
      intro: `A new ${obs.animal || 'animal'} sighting was submitted.`,
      accent: '#526b38',
    };
  }
  if (categoryRaw === 'incident') {
    return {
      category: 'incident',
      item: obs.incident_type || '',
      heading: 'INCIDENT ALERT',
      subject: `Incident alert: ${obs.incident_type || 'Incident'} — KPR`,
      intro: `A new ${obs.incident_type || 'incident'} was reported.`,
      accent: '#b42318',
    };
  }
  if (categoryRaw === 'maintenance') {
    return {
      category: 'maintenance',
      item: obs.maintenance_type || '',
      heading: 'MAINTENANCE ALERT',
      subject: `Maintenance alert: ${obs.maintenance_type || 'Issue'} — KPR`,
      intro: `A maintenance report was submitted: ${obs.maintenance_type || 'issue'}.`,
      accent: '#c9a96b',
    };
  }
  return null;
}

async function resolveRecipients(db, category, item) {
  const snap = await db.collection('notificationRules').get();
  const itemNorm = String(item || '').trim().toLowerCase();
  const userIds = new Set();
  let matchedRules = 0;

  for (const doc of snap.docs) {
    const rule = doc.data() || {};
    if (rule.enabled === false) continue;
    if (String(rule.category || '').toLowerCase() !== category) continue;
    if (!itemMatches(normalizeItems(rule.items), itemNorm, category)) continue;
    matchedRules += 1;
    (rule.userIds || []).forEach((id) => id && userIds.add(String(id)));
  }

  const emails = [];
  for (const uid of userIds) {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) continue;
    const data = userDoc.data() || {};
    if (data.status === 'revoked') continue;
    const email = String(data.email || '').trim().toLowerCase();
    if (email) emails.push(email);
  }

  return {
    emails: [...new Set(emails)],
    matchedRules,
    rulesScanned: snap.size,
  };
}

async function sendViaResend({ to, subject, html }) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || '').trim();
  if (!key || !fromEmail.includes('@') || fromEmail === 'RESEND_FROM_EMAIL') {
    return { success: false, reason: 'Resend not configured' };
  }
  const fromName = (process.env.EMAIL_FROM_NAME || 'KPR Wildlife Tracker').trim();
  const from = `${fromName} <${fromEmail}>`;

  const results = [];
  for (const recipient of to) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [recipient], subject, html }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      results.push({
        success: false,
        recipient,
        error: body?.message || body?.error || `HTTP ${res.status}`,
      });
    } else {
      results.push({ success: true, recipient, messageId: body?.id });
    }
  }
  const ok = results.some((r) => r.success);
  return { success: ok, results, message: `Sent to ${results.filter((r) => r.success).length}/${to.length}` };
}

function buildHtml(event, obs) {
  const maps =
    obs.latitude != null && obs.longitude != null
      ? `https://www.google.com/maps?q=${obs.latitude},${obs.longitude}`
      : null;
  const rows = [
    ['Category', obs.category || ''],
    ['Type / species', event.item || 'N/A'],
    ['Reporter', obs.user || 'Unknown'],
    ['When', obs.timestamp || ''],
    [
      'Coordinates',
      obs.latitude != null ? `${obs.latitude}, ${obs.longitude}` : 'N/A',
    ],
  ];
  const detailRows = rows
    .map(
      ([l, v]) =>
        `<div style="margin:12px 0;padding:14px;background:#fff;border-radius:8px;border-left:4px solid #526b38;"><strong>${l}:</strong> ${String(v)}</div>`
    )
    .join('');
  const mapBlock = maps
    ? `<p><a href="${maps}" style="display:inline-block;background:#526b38;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;">View on Google Maps</a></p>`
    : '';
  return `<!DOCTYPE html><html><body style="font-family:Segoe UI,Tahoma,sans-serif;background:#f4f1ea;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:${event.accent};color:#fff;padding:24px;text-align:center;">
        <h1 style="margin:0;font-size:22px;">${event.heading}</h1>
      </div>
      <div style="padding:28px;background:#faf8f4;">
        <p style="font-weight:600;">${event.intro}</p>
        ${detailRows}${mapBlock}
        <p style="font-size:13px;color:#666;">KPR Wildlife Tracker</p>
      </div>
    </div></body></html>`;
}

async function notifyObservationDoc(db, docSnap) {
  const obs = { id: docSnap.id, ...docSnap.data() };
  const event = eventFromObservation(obs);
  if (!event) {
    const result = { success: false, reason: `Unsupported category: ${obs.category}` };
    await docSnap.ref.set({ notification: result, notificationAt: new Date().toISOString() }, { merge: true });
    return result;
  }

  const { emails, matchedRules, rulesScanned } = await resolveRecipients(
    db,
    event.category,
    event.item
  );

  if (!emails.length) {
    const result = {
      success: false,
      reason: `No matching notification rules for ${event.category}/${event.item || '(any)'}`,
      matchedRules,
      rulesScanned,
    };
    await docSnap.ref.set({ notification: result, notificationAt: new Date().toISOString() }, { merge: true });
    return result;
  }

  const send = await sendViaResend({
    to: emails,
    subject: event.subject,
    html: buildHtml(event, obs),
  });

  const result = {
    ...send,
    matchedRules,
    rulesScanned,
    recipients: emails.map((e) => {
      const [u, d] = e.split('@');
      return `${(u || '').slice(0, 2)}***@${d || '?'}`;
    }),
    category: event.category,
    item: event.item,
  };
  await docSnap.ref.set({ notification: result, notificationAt: new Date().toISOString() }, { merge: true });
  return result;
}

/** Replay alert for a specific Firestore observation document id. */
export async function replayObservationAlert(observationId) {
  try {
    if (!observationId) return fail('Observation id is required');
    const db = getAdminDb();
    const docSnap = await db.collection('observations').doc(String(observationId).trim()).get();
    if (!docSnap.exists) return fail('Observation not found in Firestore');
    const result = await notifyObservationDoc(db, docSnap);
    return { success: !!result.success, observationId: docSnap.id, result };
  } catch (error) {
    console.error('replayObservationAlert failed:', error);
    return fail(error.message || 'Replay failed');
  }
}

/** Find the latest sighting (optionally for a species) and send its alert. */
export async function replayLatestSightingAlert(animal) {
  try {
    const db = getAdminDb();
    let snap;
    try {
      snap = await db.collection('observations').orderBy('timestamp', 'desc').limit(80).get();
    } catch {
      snap = await db.collection('observations').limit(80).get();
    }

    const want = String(animal || '').trim().toLowerCase();
    const docs = snap.docs.filter((d) => {
      const data = d.data() || {};
      if (String(data.category || '').toLowerCase() !== 'sighting') return false;
      if (!want) return true;
      return String(data.animal || '').trim().toLowerCase() === want;
    });

    if (!docs.length) {
      return fail(
        want
          ? `No sightings found for "${animal}" in the latest observations`
          : 'No sightings found in the latest observations'
      );
    }

    const docSnap = docs[0];
    const data = docSnap.data() || {};
    const result = await notifyObservationDoc(db, docSnap);
    return {
      success: !!result.success,
      observationId: docSnap.id,
      animal: data.animal,
      timestamp: data.timestamp,
      result,
    };
  } catch (error) {
    console.error('replayLatestSightingAlert failed:', error);
    return fail(error.message || 'Replay failed');
  }
}
