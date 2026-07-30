/**
 * Fire check service - fetches FIRMS data for the concession and sends
 * email notifications only for fires inside the concession boundary.
 */

const { sendFireNotifications } = require('./notificationServices');
const { fetchFireData } = require('./fireDataService');

async function fetchFiresAndSendNotifications(days = 3) {
  const features = await fetchFireData(days);
  console.log(`[FireCheck] ${features.length} fire(s) inside concession`);

  let notificationResults = {};
  if (features.length > 0) {
    try {
      notificationResults = await sendFireNotifications(features);
      console.log('[FireCheck] Notification results:', notificationResults);
    } catch (err) {
      console.error('[FireCheck] Notification error:', err);
      notificationResults = { error: err.message };
    }
  } else {
    console.log('[FireCheck] No concession fires — skipping emails');
  }

  return { features, notificationResults };
}

module.exports = { fetchFiresAndSendNotifications };
