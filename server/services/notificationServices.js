const { pointInFireArea, fireCoords } = require('./concessionBoundary');
const { sendResendEmail, buildAlertHtml, isConfigured } = require('./resendEmail');
const { getRecipientEmailsForEvent, envFallbackEmails } = require('./notificationRules');

const generateGoogleMapsLink = (latitude, longitude) =>
  `https://www.google.com/maps?q=${latitude},${longitude}`;

const formatIncidentDetails = (incidentData) => {
  const {
    id,
    category,
    incident_type,
    poaching_type,
    latitude,
    longitude,
    timestamp,
    user,
    animal,
    notes,
    image_path,
    image_url,
  } = incidentData;

  const mapsLink =
    latitude != null && longitude != null
      ? generateGoogleMapsLink(latitude, longitude)
      : null;
  const formattedDate = new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return {
    id,
    category,
    incident_type,
    poaching_type: poaching_type || 'N/A',
    latitude,
    longitude,
    mapsLink,
    timestamp: formattedDate,
    user: user || 'Unknown',
    animal: animal || 'N/A',
    notes: notes || 'No additional notes',
    coordinates:
      latitude != null && longitude != null ? `${latitude}, ${longitude}` : 'N/A',
    has_image: !!(image_path || image_url),
  };
};

const formatFireDetails = (fireData) => {
  const props = fireData.properties || fireData;
  const { lat: resolvedLat, lon: resolvedLon } = fireCoords(
    fireData.geometry
      ? fireData
      : {
          geometry: { coordinates: [props.longitude, props.latitude] },
          properties: props,
        }
  );
  const latitude = resolvedLat;
  const longitude = resolvedLon;
  const { brightness, confidence, frp, sensor, acq_date, acq_time } = props;

  const mapsLink = generateGoogleMapsLink(latitude, longitude);

  let formattedTime = 'Unknown';
  if (acq_time) {
    const timeStr = acq_time.toString().padStart(4, '0');
    formattedTime = `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}`;
  }

  const formattedDate = acq_date
    ? new Date(acq_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown';

  return {
    latitude,
    longitude,
    mapsLink,
    coordinates: `${latitude}, ${longitude}`,
    brightness: brightness || 'N/A',
    confidence: confidence || 'N/A',
    frp: frp || 'N/A',
    sensor: sensor || 'Unknown',
    acq_date: formattedDate,
    acq_time: formattedTime,
    region: getFireRegion(latitude, longitude),
    fireCount: props.fireCount,
    message: props.message,
  };
};

const getFireRegion = (latitude, longitude) => {
  if (pointInFireArea(Number(latitude), Number(longitude))) {
    return 'Okavango Delta';
  }
  return 'Outside Okavango Delta AOI';
};

async function resolveRecipients(category, item) {
  let recipients = await getRecipientEmailsForEvent({ category, item });
  if (recipients.length === 0) {
    // Legacy fallback only when no admin rules matched
    recipients = envFallbackEmails();
  }
  return recipients;
}

async function sendHtmlToRecipients(recipients, subject, html) {
  if (!isConfigured()) {
    console.log('Resend not configured, skipping email notification');
    return { success: false, reason: 'Resend not configured' };
  }
  if (!recipients.length) {
    console.warn('No notification email recipients configured');
    return { success: false, reason: 'No recipients configured' };
  }
  return sendResendEmail({ to: recipients, subject, html });
}

const sendPoachingIncidentEmail = async (incidentData) => {
  const recipients = await resolveRecipients('incident', incidentData.incident_type || 'Poaching');
  const details = formatIncidentDetails(incidentData);
  const subject = 'POACHING INCIDENT ALERT — KPR';
  const html = buildAlertHtml({
    heading: 'POACHING INCIDENT ALERT',
    subtitle: 'Immediate Action Required',
    intro:
      'URGENT: A poaching incident has been reported and requires immediate attention from wildlife protection teams.',
    accent: '#b42318',
    mapsLink: details.mapsLink,
    footer: 'Please respond immediately to protect wildlife. — KPR Wildlife Tracker',
    rows: [
      ['Incident ID', details.id],
      ['Type', details.incident_type],
      ['Poaching type', details.poaching_type],
      ['Animal', details.animal],
      ['Reporter', details.user],
      ['When', details.timestamp],
      ['Coordinates', details.coordinates],
      ['Notes', details.notes],
      ['Image', details.has_image ? 'Attached (view in app)' : 'None'],
    ],
  });
  return sendHtmlToRecipients(recipients, subject, html);
};

const sendObservationNotification = async (observation) => {
  const categoryRaw = (observation.category || '').toLowerCase();
  let category;
  let item;
  let subject;
  let heading;
  let intro;
  let accent = '#526b38';
  const details = formatIncidentDetails(observation);

  if (categoryRaw === 'sighting') {
    category = 'sighting';
    item = observation.animal;
    subject = `Sighting alert: ${item || 'Animal'} — KPR`;
    heading = 'SIGHTING ALERT';
    intro = `A new ${item || 'animal'} sighting was submitted.`;
  } else if (categoryRaw === 'incident') {
    category = 'incident';
    item = observation.incident_type;
    const isPoach = isPoachingIncident(observation);
    subject = isPoach
      ? 'POACHING INCIDENT ALERT — KPR'
      : `Incident alert: ${item || 'Incident'} — KPR`;
    heading = isPoach ? 'POACHING INCIDENT ALERT' : 'INCIDENT ALERT';
    intro = isPoach
      ? 'URGENT: A poaching incident has been reported.'
      : `A new ${item || 'incident'} was reported.`;
    accent = '#b42318';
  } else if (categoryRaw === 'maintenance') {
    category = 'maintenance';
    item = observation.maintenance_type;
    subject = `Maintenance alert: ${item || 'Issue'} — KPR`;
    heading = 'MAINTENANCE ALERT';
    intro = `A maintenance report was submitted: ${item || 'issue'}.`;
    accent = '#c9a96b';
  } else {
    return { success: false, reason: 'Unsupported category' };
  }

  const recipients = await resolveRecipients(category, item);
  if (recipients.length === 0) {
    console.log(`No notification rules matched for ${category}/${item}`);
    return { success: true, reason: 'No matching notification rules' };
  }

  const rows = [
    ['Category', observation.category],
    ['Type / species', item || 'N/A'],
  ];
  if (observation.poaching_type) rows.push(['Poaching type', observation.poaching_type]);
  if (observation.poached_animal) rows.push(['Poached animal', observation.poached_animal]);
  if (observation.animal && category !== 'sighting') rows.push(['Animal', observation.animal]);
  rows.push(
    ['Reporter', details.user],
    ['When', details.timestamp],
    ['Coordinates', details.coordinates],
    ['Notes', details.notes],
    ['Image', details.has_image ? 'Attached (view in app)' : 'None']
  );

  const html = buildAlertHtml({
    heading,
    subtitle: 'Khwai Private Reserve',
    intro,
    accent,
    mapsLink: details.mapsLink,
    footer: 'KPR Wildlife Tracker',
    rows,
  });

  return sendHtmlToRecipients(recipients, subject, html);
};

const sendPoachingIncidentNotifications = async (incidentData) => {
  console.log('Sending poaching incident email notifications via Resend...');
  const results = { email: null, timestamp: new Date().toISOString() };
  try {
    results.email = await sendPoachingIncidentEmail(incidentData);
  } catch (error) {
    console.error('Email notification failed:', error);
    results.email = { success: false, error: error.message };
  }
  return results;
};

const isPoachingIncident = (incidentData) => {
  const { category, incident_type } = incidentData;
  if (category !== 'Incident') return false;
  const poachingKeywords = ['poach', 'illegal hunting', 'snare', 'trap'];
  const incidentTypeLower = (incident_type || '').toLowerCase();
  return poachingKeywords.some((keyword) => incidentTypeLower.includes(keyword));
};

const sendFireAlertNotification = async (fireData) => {
  const recipients = await resolveRecipients('fire', 'Any fire in Okavango Delta / KPR');
  const details = formatFireDetails(fireData);
  const count = details.fireCount || 1;
  const subject = count > 1 ? `FIRE ALERT — ${count} detections — KPR` : 'FIRE ALERT — KPR';
  const html = buildAlertHtml({
    heading: 'FIRE ALERT',
    subtitle: 'Satellite Detection — Immediate Action Required',
    intro:
      details.message ||
      'URGENT: Satellite thermal detection has identified a fire requiring immediate attention.',
    accent: '#c2410c',
    mapsLink: details.mapsLink,
    footer: 'Please assess and respond. — KPR Fire Alert System',
    rows: [
      ['Region', details.region],
      ['Sensor', details.sensor],
      ['Date', `${details.acq_date} ${details.acq_time}`],
      ['Coordinates', details.coordinates],
      ['Confidence', `${details.confidence}%`],
      ['Brightness', `${details.brightness} K`],
      ['FRP', `${details.frp} MW`],
      ['Detections', String(count)],
    ],
  });
  return sendHtmlToRecipients(recipients, subject, html);
};

const sendFireNotifications = async (firesData) => {
  console.log('Evaluating fire alert emails (Oka_Delta AOI, Resend)...');

  const results = {
    email: null,
    timestamp: new Date().toISOString(),
    fireCount: firesData.length,
  };

  const monitoredFires = (firesData || []).filter((fire) => {
    const { lat, lon } = fireCoords(fire);
    return !Number.isNaN(lat) && !Number.isNaN(lon) && pointInFireArea(lat, lon);
  });

  if (monitoredFires.length > 0) {
    console.log(`${monitoredFires.length} fire(s) inside Oka_Delta — sending alerts`);
    try {
      const first = monitoredFires[0];
      const { lat, lon } = fireCoords(first);
      const consolidatedFireData = {
        properties: {
          ...first.properties,
          fireCount: monitoredFires.length,
          message: `${monitoredFires.length} fire(s) detected inside Okavango Delta AOI`,
          latitude: lat,
          longitude: lon,
        },
      };
      results.email = await sendFireAlertNotification(consolidatedFireData);
    } catch (error) {
      console.error('Fire alert notification failed:', error);
      results.email = { success: false, error: error.message };
    }
  } else {
    console.log('No fires inside Oka_Delta — no email alerts');
    results.email = { success: true, reason: 'No fires inside Oka_Delta' };
  }

  return results;
};

module.exports = {
  sendPoachingIncidentNotifications,
  sendObservationNotification,
  isPoachingIncident,
  sendFireNotifications,
  generateGoogleMapsLink,
  formatIncidentDetails,
  formatFireDetails,
};
