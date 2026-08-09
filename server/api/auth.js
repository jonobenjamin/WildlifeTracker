const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { getDb } = require('../firestoreDb');

const router = express.Router();

// Verify password against stored hash (matches admin.js hashPassword)
// Salt stored as hex - decode to 16-byte Buffer for pbkdf2 (correct approach)
// Also supports legacy: salt was hex string passed directly to pbkdf2
function verifyPassword(password, saltHex, storedHash) {
  const saltStr = String(saltHex || '').trim();
  const hashStr = String(storedHash || '').trim();
  if (!saltStr || !hashStr) return false;

  // New format: salt is hex of 16 random bytes, use Buffer
  const saltBuffer = Buffer.from(saltStr, 'hex');
  if (saltBuffer.length === 16) {
    const hash = crypto.pbkdf2Sync(password, saltBuffer, 100000, 64, 'sha512').toString('hex');
    if (hash === hashStr) return true;
  }

  // Legacy format: salt was hex string used as string (admin passed .toString('hex') to pbkdf2)
  const legacyHash = crypto.pbkdf2Sync(password, saltStr, 100000, 64, 'sha512').toString('hex');
  return legacyHash === hashStr;
}

function hashPasswordForStorage(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt: salt.toString('hex'), hash };
}

// Name + password login
router.post('/login', async (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name and password are required'
      });
    }

    const db = getDb();
    const usersSnap = await db.collection('users').get();

    const nameLower = name.trim().toLowerCase();
    const matches = [];

    usersSnap.forEach(doc => {
      const d = doc.data();
      if (d.status === 'revoked') return;
      const docName = (d.name || '').trim().toLowerCase();
      if (docName === nameLower) matches.push({ id: doc.id, data: d });
    });

    if (matches.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (matches.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Multiple users with this name - please use "Forgot password?" and sign in with email'
      });
    }

    const { id: uid, data } = matches[0];

    if (!data.passwordSalt || !data.passwordHash) {
      return res.status(401).json({
        success: false,
        message: 'No password set for this account - use "Forgot password?" to sign in with email PIN'
      });
    }

    if (!verifyPassword(password, data.passwordSalt, data.passwordHash)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    const customToken = await admin.auth().createCustomToken(uid, {
      email: data.email,
      name: data.name,
      provider: 'password'
    });

    await db.collection('users').doc(uid).set(
      { lastLogin: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    res.json({
      success: true,
      customToken,
      name: data.name,
      role: (data.role || 'user').toString().toLowerCase(),
      email: data.email || null,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

const PIN_TTL_MS = 15 * 60 * 1000;
const PIN_COLLECTION = 'auth_pins';

// Generate a secure PIN
function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash PIN for storage
function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

function pinDocId(emailKey) {
  return String(emailKey || '')
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 120);
}

/** Persist PINs in Firestore — in-memory Maps do not work across Vercel serverless instances. */
async function savePin(emailKey, data) {
  const db = getDb();
  await db
    .collection(PIN_COLLECTION)
    .doc(pinDocId(emailKey))
    .set({
      email: emailKey,
      pin: data.pin,
      name: data.name,
      timestamp: data.timestamp,
      attempts: data.attempts || 0,
      expiresAt: data.timestamp + PIN_TTL_MS,
    });
}

async function loadPin(emailKey) {
  const db = getDb();
  const snap = await db.collection(PIN_COLLECTION).doc(pinDocId(emailKey)).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function updatePinAttempts(emailKey, attempts) {
  const db = getDb();
  await db.collection(PIN_COLLECTION).doc(pinDocId(emailKey)).set({ attempts }, { merge: true });
}

async function deletePin(emailKey) {
  const db = getDb();
  await db.collection(PIN_COLLECTION).doc(pinDocId(emailKey)).delete().catch(() => {});
}

function userDocIdFromEmail(emailKey) {
  return `email_${String(emailKey).toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}`;
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

    const emailKey = email.toLowerCase().trim();
    const db = getDb();
    const uid = userDocIdFromEmail(emailKey);
    const existing = await db.collection('users').doc(uid).get();
    if (existing.exists && existing.data()?.status === 'revoked') {
      return res.status(403).json({
        success: false,
        message: 'This account has been suspended. Contact an administrator.',
      });
    }

    // Generate PIN
    const pin = generatePin();
    const hashedPin = hashPin(pin);
    const timestamp = Date.now();

    // Store PIN with expiry (Firestore — shared across serverless instances)
    await savePin(emailKey, {
      pin: hashedPin,
      name: name.trim(),
      timestamp,
      attempts: 0,
    });

    // Send PIN via Resend
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
      await sendPinEmail(emailKey, emailSubject, emailBodyHtml, true); // true = HTML email

      console.log(`PIN sent to ${emailKey}`);
    } catch (emailError) {
      console.error('Failed to send PIN email:', emailError);
      await deletePin(emailKey);
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
    console.log('🔍 PIN verification request received:', { email: req.body.email, pin: req.body.pin });
    const { email, pin } = req.body;

    if (!email || !pin) {
      console.log('Missing email or PIN');
      return res.status(400).json({
        success: false,
        message: 'Email and PIN are required'
      });
    }

    const emailKey = email.toLowerCase().trim();
    console.log('Looking up PIN for email:', emailKey);
    const storedData = await loadPin(emailKey);
    console.log('Stored data found:', !!storedData);

    if (!storedData) {
      console.log('PIN not found or expired for:', emailKey);
      return res.status(400).json({
        success: false,
        message: 'PIN not found or expired. Please request a new PIN.'
      });
    }

    // Check expiry (15 minutes)
    const now = Date.now();
    const issuedAt = Number(storedData.timestamp) || 0;
    if (!issuedAt || now - issuedAt > PIN_TTL_MS) {
      await deletePin(emailKey);
      return res.status(400).json({
        success: false,
        message: 'PIN has expired. Please request a new PIN.'
      });
    }

    // Check attempts (max 5)
    const attempts = Number(storedData.attempts) || 0;
    if (attempts >= 5) {
      await deletePin(emailKey);
      return res.status(400).json({
        success: false,
        message: 'Too many failed attempts. Please request a new PIN.'
      });
    }

    // Verify PIN
    console.log('Verifying PIN for:', emailKey);
    const hashedInputPin = hashPin(pin);
    console.log('PIN hash comparison:', hashedInputPin === storedData.pin ? 'MATCH' : 'NO MATCH');

    if (hashedInputPin !== storedData.pin) {
      const nextAttempts = attempts + 1;
      await updatePinAttempts(emailKey, nextAttempts);
      console.log('Invalid PIN attempt', nextAttempts, 'for:', emailKey);
      return res.status(400).json({
        success: false,
        message: `Invalid PIN. ${5 - nextAttempts} attempts remaining.`
      });
    }

    console.log('PIN verified successfully for:', emailKey);

    // PIN is valid - create custom token
    console.log('Creating Firebase custom token...');
    const uid = userDocIdFromEmail(emailKey);
    const displayName = (storedData.name || '').trim() || emailKey;
    const additionalClaims = {
      email: emailKey,
      name: displayName,
      provider: 'email_pin'
    };

    console.log('Token details:', { uid, claims: additionalClaims });
    const customToken = await admin.auth().createCustomToken(uid, additionalClaims);
    console.log('Custom token created successfully');

    const db = getDb();
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (userSnap.exists && userSnap.data()?.status === 'revoked') {
      await deletePin(emailKey);
      return res.status(403).json({
        success: false,
        message: 'This account has been suspended. Contact an administrator.',
      });
    }

    const existing = userSnap.exists ? userSnap.data() || {} : {};
    const role = (existing.role || 'viewer').toString().toLowerCase();
    await userRef.set(
      {
        uid,
        email: emailKey,
        name: existing.name || displayName,
        role,
        status: existing.status || 'active',
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        ...(userSnap.exists ? {} : { registeredAt: admin.firestore.FieldValue.serverTimestamp(), createdBy: 'pin_login' }),
      },
      { merge: true }
    );

    // Clean up used PIN
    await deletePin(emailKey);

    console.log(`PIN verified for ${emailKey}, created custom token for ${uid}`);

    const responseData = {
      success: true,
      customToken,
      name: existing.name || displayName,
      role,
      email: emailKey,
    };
    console.log('Sending response:', { success: true, hasToken: !!customToken, name: responseData.name, role });

    res.json(responseData);

  } catch (error) {
    console.error('PIN verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update password for signed-in user (Bearer Firebase ID token)
router.post('/change-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authorization token required' });
    }

    const { newPassword, confirmPassword } = req.body || {};
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirmation are required'
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const db = getDb();
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, message: 'User profile not found' });
    }

    const { salt, hash } = hashPasswordForStorage(newPassword);
    await userRef.update({
      passwordSalt: salt,
      passwordHash: hash,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('change-password error:', error);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ success: false, message: 'Session expired; please sign in again' });
    }
    if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ success: false, message: 'Invalid session; please sign in again' });
    }
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

// PIN / auth emails via Resend
async function sendPinEmail(toEmail, subject, body, isHtml = false) {
  const { sendResendEmail, escapeHtml, isConfigured } = require('../services/resendEmail');

  if (!isConfigured()) {
    throw new Error('Resend not configured (set RESEND_API_KEY and RESEND_FROM_EMAIL)');
  }

  const pinMatch = body.match(/pin-code[^>]*>(\d{6})</) || body.match(/\b(\d{6})\b/);
  const pinCode = pinMatch ? pinMatch[1] : null;

  const html = isHtml
    ? body
    : `<!DOCTYPE html><html><body style="font-family:Segoe UI,Tahoma,sans-serif;background:#f4f1ea;padding:24px;">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;">
        <h2 style="margin:0 0 12px;color:#43512d;">${escapeHtml(subject)}</h2>
        <p style="color:#333;white-space:pre-wrap;">${escapeHtml(body)}</p>
        ${pinCode ? `<p style="font-size:28px;letter-spacing:6px;font-weight:700;color:#526b38;margin:20px 0;">${escapeHtml(pinCode)}</p>` : ''}
        <p style="font-size:13px;color:#666;margin:0;">KPR Wildlife Tracker</p>
      </div></body></html>`;

  const result = await sendResendEmail({
    to: toEmail,
    subject,
    html,
    text: pinCode ? `${subject}\n\nYour PIN: ${pinCode}` : body,
  });

  if (!result.success) {
    throw new Error(result.reason || result.message || 'Failed to send PIN email');
  }
  console.log('Resend PIN email success:', result.message);
}

module.exports = router;