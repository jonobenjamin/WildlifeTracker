const emailjs = require('@emailjs/nodejs');

// Initialize EmailJS
const initializeEmailJS = () => {
  if (!process.env.EMAILJS_SERVICE_ID || !process.env.EMAILJS_TEMPLATE_ID || !process.env.EMAILJS_PUBLIC_KEY || !process.env.EMAILJS_PRIVATE_KEY) {
    console.warn('EmailJS credentials not configured. Email notifications disabled.');
    return false;
  }

  // Initialize EmailJS with both public and private keys
  emailjs.init({
    publicKey: process.env.EMAILJS_PUBLIC_KEY,
    privateKey: process.env.EMAILJS_PRIVATE_KEY,
  });

  return true;
};


// Generate Google Maps link from coordinates
const generateGoogleMapsLink = (latitude, longitude) => {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
};

// Format incident details for notification
const formatIncidentDetails = (incidentData) => {
  const {
    id,
    category,
    incident_type,
    latitude,
    longitude,
    timestamp,
    user,
    animal,
    notes
  } = incidentData;

  const mapsLink = generateGoogleMapsLink(latitude, longitude);
  const formattedDate = new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  return {
    id,
    category,
    incident_type,
    latitude,
    longitude,
    mapsLink,
    timestamp: formattedDate,
    user: user || 'Unknown',
    animal: animal || 'N/A',
    notes: notes || 'No additional notes',
    coordinates: `${latitude}, ${longitude}`
  };
};

// Send email notification using EmailJS
const sendEmailNotification = async (incidentData) => {
  if (!initializeEmailJS()) {
    console.log('EmailJS not configured, skipping email notification');
    return { success: false, reason: 'EmailJS not configured' };
  }

  const recipients = process.env.NOTIFICATION_EMAILS ?
    process.env.NOTIFICATION_EMAILS.split(',').map(email => email.trim()) : [];

  if (recipients.length === 0) {
    console.warn('No notification email recipients configured');
    return { success: false, reason: 'No recipients configured' };
  }

  const details = formatIncidentDetails(incidentData);

  // Prepare template parameters for EmailJS
  const templateParams = {
    incident_id: details.id,
    incident_type: details.incident_type,
    timestamp: details.timestamp,
    reporter: details.user,
    animal: details.animal || 'N/A',
    coordinates: details.coordinates,
    notes: details.notes,
    maps_link: details.mapsLink,
    maps_link_text: details.mapsLink,
    from_name: process.env.EMAIL_FROM_NAME || 'Wildlife Tracker Alert'
  };

  try {
    // Send to each recipient individually (EmailJS template approach)
    const results = [];

    for (const recipient of recipients) {
      try {
        const result = await emailjs.send(
          process.env.EMAILJS_SERVICE_ID,
          process.env.EMAILJS_TEMPLATE_ID,
          {
            ...templateParams,
            to_email: recipient
          }
        );
        results.push({ success: true, recipient, messageId: result.text });
        console.log(`Email sent to ${recipient}:`, result.text);
      } catch (error) {
        console.error(`Failed to send email to ${recipient}:`, error);
        results.push({ success: false, recipient, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return {
      success: successCount > 0,
      results,
      message: `Sent to ${successCount}/${recipients.length} recipients`
    };
  } catch (error) {
    console.error('Error sending email notification:', error);
    return { success: false, error: error.message };
  }
};


// Main function to send notifications for a poaching incident
const sendPoachingIncidentNotifications = async (incidentData) => {
  console.log('🚨 Sending poaching incident email notifications...');

  const results = {
    email: null,
    timestamp: new Date().toISOString()
  };

  // Send email notification
  try {
    results.email = await sendEmailNotification(incidentData);
  } catch (error) {
    console.error('Email notification failed:', error);
    results.email = { success: false, error: error.message };
  }

  console.log('Notification results:', JSON.stringify(results, null, 2));
  return results;
};

// Check if incident is a poaching incident
const isPoachingIncident = (incidentData) => {
  const { category, incident_type } = incidentData;
  
  if (category !== 'Incident') {
    return false;
  }

  // Check if incident_type contains "poach" (case-insensitive)
  const poachingKeywords = ['poach', 'illegal hunting', 'snare', 'trap'];
  const incidentTypeLower = (incident_type || '').toLowerCase();
  
  return poachingKeywords.some(keyword => incidentTypeLower.includes(keyword));
};

module.exports = {
  sendPoachingIncidentNotifications,
  isPoachingIncident,
  generateGoogleMapsLink,
  formatIncidentDetails
};
