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
    console.log('Request body:', req.body);
    const { email, name } = req.body;
    console.log('Extracted email:', email, 'name:', name);

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

      // HTML email template
      const emailBodyHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Wildlife Tracker PIN</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #2e7d32;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #2e7d32;
            margin-bottom: 10px;
        }
        .tagline {
            color: #666;
            font-size: 16px;
        }
        .pin-container {
            background: linear-gradient(135deg, #2e7d32, #4caf50);
            border-radius: 8px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
            color: white;
        }
        .pin-label {
            font-size: 14px;
            margin-bottom: 10px;
            opacity: 0.9;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .pin-code {
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 8px;
            margin: 10px 0;
            font-family: 'Courier New', monospace;
        }
        .pin-note {
            font-size: 12px;
            opacity: 0.8;
            margin-top: 15px;
        }
        .content {
            margin: 30px 0;
            line-height: 1.7;
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
            color: #856404;
        }
        .warning strong {
            display: block;
            margin-bottom: 5px;
        }
        .footer {
            border-top: 1px solid #eee;
            padding-top: 20px;
            margin-top: 40px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
        .security-note {
            background: #e8f5e8;
            border-left: 4px solid #2e7d32;
            padding: 15px;
            margin: 20px 0;
        }
        .contact {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🦌 Wildlife Tracker</div>
            <div class="tagline">Field Observation Platform</div>
        </div>

        <div class="content">
            <h2>Hello ${name.trim()}!</h2>

            <p>Welcome to Wildlife Tracker. To complete your sign-in, please use the verification PIN below:</p>

            <div class="pin-container">
                <div class="pin-label">Your Verification PIN</div>
                <div class="pin-code">${pin}</div>
                <div class="pin-note">Valid for 15 minutes</div>
            </div>

            <div class="security-note">
                <strong>🔒 Security Notice:</strong> This PIN is unique to your email address and will expire in 15 minutes. Do not share this PIN with anyone.
            </div>

            <div class="warning">
                <strong>⚠️ Important:</strong> If you didn't request this PIN, please ignore this email. Your account remains secure.
            </div>

            <p>
                Enter this PIN in the Wildlife Tracker app to complete your authentication.
                This helps us ensure that only authorized field users can access the observation platform.
            </p>

            <p>
                If you have any questions or need assistance, please contact your system administrator.
            </p>
        </div>

        <div class="footer">
            <div class="contact">
                <strong>Wildlife Tracker System</strong><br>
                Field observation and conservation platform
            </div>

            <p style="margin-top: 20px; font-size: 12px; color: #999;">
                This is an automated message from Wildlife Tracker.<br>
                Please do not reply to this email.
            </p>
        </div>
    </div>
</body>
</html>`;

      // Use existing email service (adapted for PIN sending)
      await sendPinEmail(email, emailSubject, emailBodyHtml, true); // true = HTML email

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
// Note: Uses EMAILJS_PIN_TEMPLATE_ID for PIN auth, EMAILJS_TEMPLATE_ID is for poaching notifications
async function sendPinEmail(toEmail, subject, body, isHtml = false) {
  const emailData = {
    service_id: process.env.EMAILJS_SERVICE_ID,
    template_id: process.env.EMAILJS_PIN_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID, // PIN template for auth, fallback to general
    user_id: process.env.EMAILJS_PUBLIC_KEY,
    accessToken: process.env.EMAILJS_PRIVATE_KEY, // Required for EmailJS API
    template_params: {
      to_email: toEmail,
      subject: subject,
      message: body,
      from_name: process.env.EMAIL_FROM_NAME || 'Wildlife Tracker',
      html_content: isHtml ? body : undefined
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
    const errorText = await response.text();
    console.error('EmailJS error response:', errorText);
    throw new Error(`EmailJS error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('EmailJS success:', result);
}

module.exports = router;
