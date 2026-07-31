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
  const categoryRaw = String(obs.category || '').toLowerCase().trim();
  if (categoryRaw === 'sighting') {
    const item = obs.animal || obs.species || obs.vulture_species || '';
    return {
      category: 'sighting',
      item,
      heading: 'SIGHTING ALERT',
      subject: `Sighting alert: ${item || 'Animal'} — KPR`,
      intro: `A new ${item || 'animal'} sighting was submitted.`,
      accent: '#526b38',
    };
  }
  if (categoryRaw === 'incident') {
    const item = obs.incident_type || '';
    return {
      category: 'incident',
      item,
      heading: 'INCIDENT ALERT',
      subject: `Incident alert: ${item || 'Incident'} — KPR`,
      intro: `A new ${item || 'incident'} was reported.`,
      accent: '#b42318',
    };
  }
  if (categoryRaw === 'maintenance') {
    const item = obs.maintenance_type || '';
    return {
      category: 'maintenance',
      item,
      heading: 'MAINTENANCE ALERT',
      subject: `Maintenance alert: ${item || 'Issue'} — KPR`,
      intro: `A maintenance report was submitted: ${item || 'issue'}.`,
      accent: '#c9a96b',
    };
  }
  return null;
}

async function loadRules(db) {
  const snap = await db.collection('notificationRules').get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

async function resolveRecipients(db, rules, category, item) {
  const itemNorm = String(item || '').trim().toLowerCase();
  const userIds = new Set();
  let matchedRules = 0;

  for (const rule of rules) {
    if (rule.enabled === false) continue;
    if (String(rule.category || '').toLowerCase().trim() !== category) continue;
    if (!itemMatches(normalizeItems(rule.items), itemNorm, category)) continue;
    matchedRules += 1;
    (rule.userIds || []).forEach((id) => id && userIds.add(String(id)));
  }

  const emails = [];
  const missingUsers = [];
  for (const uid of userIds) {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      missingUsers.push(uid);
      continue;
    }
    const data = userDoc.data() || {};
    if (data.status === 'revoked') continue;
    const email = String(data.email || '').trim().toLowerCase();
    if (email) emails.push(email);
    else missingUsers.push(`${uid}(no-email)`);
  }

  return {
    emails: [...new Set(emails)],
    matchedRules,
    rulesScanned: rules.length,
    missingUsers,
  };
}

async function sendViaResend({ to, subject, html }) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || '').trim();
  if (!key || !fromEmail.includes('@') || fromEmail === 'RESEND_FROM_EMAIL') {
    return { success: false, reason: 'Resend not configured on this Vercel project' };
  }
  const fromName = (process.env.EMAIL_FROM_NAME || 'KPR Wildlife Tracker').trim();
  const from = `${fromName} <${fromEmail}>`;

  const results = [];
  for (const recipient of to) {
    try {
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
    } catch (err) {
      results.push({ success: false, recipient, error: err.message });
    }
  }
  const ok = results.some((r) => r.success);
  return {
    success: ok,
    results,
    message: `Sent to ${results.filter((r) => r.success).length}/${to.length}`,
  };
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

async function notifyOne(db, rules, docSnap, { force = false } = {}) {
  const obs = { id: docSnap.id, ...docSnap.data() };
  if (!force && obs.notification?.success === true) {
    return { skipped: true, reason: 'Already notified', observationId: docSnap.id };
  }

  const event = eventFromObservation(obs);
  if (!event) {
    const result = { success: false, reason: `Unsupported category: ${obs.category}` };
    await docSnap.ref.set({ notification: result, notificationAt: new Date().toISOString() }, { merge: true });
    return { observationId: docSnap.id, ...result };
  }

  const resolved = await resolveRecipients(db, rules, event.category, event.item);
  if (!resolved.emails.length) {
    const result = {
      success: false,
      reason: `No matching rules/recipients for ${event.category}/${event.item || '(any)'}`,
      matchedRules: resolved.matchedRules,
      rulesScanned: resolved.rulesScanned,
      missingUsers: resolved.missingUsers,
    };
    await docSnap.ref.set({ notification: result, notificationAt: new Date().toISOString() }, { merge: true });
    return { observationId: docSnap.id, animal: obs.animal, ...result };
  }

  const send = await sendViaResend({
    to: resolved.emails,
    subject: event.subject,
    html: buildHtml(event, obs),
  });

  const result = {
    ...send,
    matchedRules: resolved.matchedRules,
    rulesScanned: resolved.rulesScanned,
    category: event.category,
    item: event.item,
  };
  await docSnap.ref.set({ notification: result, notificationAt: new Date().toISOString() }, { merge: true });
  return { observationId: docSnap.id, animal: obs.animal, ...result };
}

export async function diagnoseNotificationSetup() {
  try {
    const db = getAdminDb();
    const rules = await loadRules(db);
    const key = !!(process.env.RESEND_API_KEY || '').trim();
    const from = (process.env.RESEND_FROM_EMAIL || '').trim();
    const fromOk = !!from && from.includes('@') && from !== 'RESEND_FROM_EMAIL';

    const sightingRules = rules.filter(
      (r) => r.enabled !== false && String(r.category || '').toLowerCase() === 'sighting'
    );

    const recipientPreview = [];
    for (const rule of sightingRules) {
      for (const uid of rule.userIds || []) {
        const u = await db.collection('users').doc(String(uid)).get();
        recipientPreview.push({
          ruleId: rule.id,
          userId: uid,
          exists: u.exists,
          email: u.exists ? !!(u.data()?.email) : false,
          status: u.exists ? u.data()?.status : null,
          items: rule.items,
        });
      }
    }

    return {
      success: true,
      resend: { hasKey: key, fromOk, fromEmail: fromOk ? from : from || null },
      rulesTotal: rules.length,
      sightingRules: sightingRules.map((r) => ({
        id: r.id,
        items: r.items,
        userIds: r.userIds,
        enabled: r.enabled !== false,
      })),
      recipientPreview,
    };
  } catch (error) {
    console.error('diagnoseNotificationSetup failed:', error);
    return fail(error.message);
  }
}

export async function flushPendingObservationAlerts({ hours = 72, force = false, limit = 40 } = {}) {
  try {
    const db = getAdminDb();
    const rules = await loadRules(db);
    if (!rules.length) {
      return fail('No notification rules found in Firestore (notificationRules collection is empty)');
    }

    let snap;
    try {
      snap = await db.collection('observations').orderBy('timestamp', 'desc').limit(Math.min(limit, 100)).get();
    } catch {
      snap = await db.collection('observations').limit(Math.min(limit, 100)).get();
    }

    const cutoff = Date.now() - hours * 3600 * 1000;
    const results = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data() || {};
      const ts = Date.parse(data.timestamp || '') || 0;
      // If timestamp unparseable, still try recent docs without success notification
      if (ts && ts < cutoff) continue;
      if (!force && data.notification?.success === true) continue;
      const cat = String(data.category || '').toLowerCase();
      if (!['sighting', 'incident', 'maintenance'].includes(cat)) continue;
      const r = await notifyOne(db, rules, docSnap, { force });
      results.push(r);
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => r.success === false && !r.skipped).length;
    return {
      success: true,
      rulesTotal: rules.length,
      processed: results.length,
      sent,
      failed,
      results,
      message: `Processed ${results.length}: sent ${sent}, failed ${failed}`,
    };
  } catch (error) {
    console.error('flushPendingObservationAlerts failed:', error);
    return fail(error.message || 'Flush failed');
  }
}

export async function replayLatestSightingAlert(animal) {
  try {
    const db = getAdminDb();
    const rules = await loadRules(db);
    let snap;
    try {
      snap = await db.collection('observations').orderBy('timestamp', 'desc').limit(100).get();
    } catch {
      snap = await db.collection('observations').limit(100).get();
    }
    const want = String(animal || '').trim().toLowerCase();
    const docSnap = snap.docs.find((d) => {
      const data = d.data() || {};
      if (String(data.category || '').toLowerCase() !== 'sighting') return false;
      if (!want) return true;
      return String(data.animal || '').trim().toLowerCase() === want;
    });
    if (!docSnap) {
      return fail(want ? `No "${animal}" sightings found in latest 100 observations` : 'No sightings found');
    }
    const result = await notifyOne(db, rules, docSnap, { force: true });
    return { success: !!result.success, ...result, error: result.success ? undefined : result.reason };
  } catch (error) {
    console.error('replayLatestSightingAlert failed:', error);
    return fail(error.message);
  }
}

export async function replayObservationAlert(observationId) {
  try {
    if (!observationId) return fail('Observation id is required');
    const db = getAdminDb();
    const rules = await loadRules(db);
    const docSnap = await db.collection('observations').doc(String(observationId).trim()).get();
    if (!docSnap.exists) return fail('Observation not found');
    const result = await notifyOne(db, rules, docSnap, { force: true });
    return { success: !!result.success, ...result, error: result.success ? undefined : result.reason };
  } catch (error) {
    console.error('replayObservationAlert failed:', error);
    return fail(error.message);
  }
}
