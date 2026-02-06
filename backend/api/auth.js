const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { sendPoachingIncidentNotifications } = require('../services/notificationServices');

const router = express.Router();

// In-memory store for PINs (in production, use Redis or database)
// PINs expire after 15 minutes
const pinStore = new Map();

// Clean up expired PINs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of pinStore.entries()) {
    if (now - data.timestamp > 15 * 60 * 1000) { // 15 minutes
      pinStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Generate a secure PIN
function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash PIN for storage
function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

// Email PIN request endpoint
router.post('/request-pin', async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email and name are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Generate PIN
    const pin = generatePin();
    const hashedPin = hashPin(pin);
    const timestamp = Date.now();

    // Store PIN with expiry
    pinStore.set(email.toLowerCase(), {
      pin: hashedPin,
      name: name.trim(),
      timestamp,
      attempts: 0
    });

    // Send PIN via email using EmailJS (reuse existing notification service)
    try {
      const emailSubject = 'Your Wildlife Tracker PIN Code';
      const emailBody = `
Hello ${name.trim()},

Your PIN code for Wildlife Tracker is: ${pin}

This code will expire in 15 minutes.

If you didn't request this code, please ignore this email.

Best regards,
Wildlife Tracker Team
      `;

      // Use existing email service (adapted for PIN sending)
      await sendPinEmail(email, emailSubject, emailBody);

      console.log(`PIN sent to ${email}: ${pin}`);
    } catch (emailError) {
      console.error('Failed to send PIN email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send PIN email. Please try again.'
      });
    }

    res.json({
      success: true,
      message: 'PIN sent to your email'
    });

  } catch (error) {
    console.error('PIN request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// PIN verification endpoint
router.post('/verify-pin', async (req, res) => {
  try {
    const { email, pin } = req.body;

    if (!email || !pin) {
      return res.status(400).json({
        success: false,
        message: 'Email and PIN are required'
      });
    }

    const emailKey = email.toLowerCase();
    const storedData = pinStore.get(emailKey);

    if (!storedData) {
      return res.status(400).json({
        success: false,
        message: 'PIN not found or expired. Please request a new PIN.'
      });
    }

    // Check expiry (15 minutes)
    const now = Date.now();
    if (now - storedData.timestamp > 15 * 60 * 1000) {
      pinStore.delete(emailKey);
      return res.status(400).json({
        success: false,
        message: 'PIN has expired. Please request a new PIN.'
      });
    }

    // Check attempts (max 5)
    if (storedData.attempts >= 5) {
      pinStore.delete(emailKey);
      return res.status(400).json({
        success: false,
        message: 'Too many failed attempts. Please request a new PIN.'
      });
    }

    // Verify PIN
    const hashedInputPin = hashPin(pin);
    if (hashedInputPin !== storedData.pin) {
      storedData.attempts++;
      return res.status(400).json({
        success: false,
        message: `Invalid PIN. ${5 - storedData.attempts} attempts remaining.`
      });
    }

    // PIN is valid - create custom token
    const uid = `email_${emailKey.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const additionalClaims = {
      email: emailKey,
      name: storedData.name,
      provider: 'email_pin'
    };

    const customToken = await admin.auth().createCustomToken(uid, additionalClaims);

    // Clean up used PIN
    pinStore.delete(emailKey);

    console.log(`PIN verified for ${email}, created custom token for ${uid}`);

    res.json({
      success: true,
      customToken,
      name: storedData.name
    });

  } catch (error) {
    console.error('PIN verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Helper function to send PIN emails (adapted from existing email service)
async function sendPinEmail(toEmail, subject, body) {
  const emailData = {
    service_id: process.env.EMAILJS_SERVICE_ID,
    template_id: process.env.EMAILJS_TEMPLATE_ID,
    user_id: process.env.EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email: toEmail,
      subject: subject,
      message: body,
      from_name: process.env.EMAIL_FROM_NAME || 'Wildlife Tracker'
    }
  };

  // Use EmailJS to send the email
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailData)
  });

  if (!response.ok) {
    throw new Error(`EmailJS error: ${response.status}`);
  }
}

module.exports = router;
