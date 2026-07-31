const express = require('express');
const { isConfigured } = require('../services/resendEmail');

const router = express.Router();

router.get('/', (req, res) => {
  const fromEmail = (process.env.RESEND_FROM_EMAIL || '').trim();
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    email: {
      resendConfigured: isConfigured(),
      hasApiKey: !!(process.env.RESEND_API_KEY || '').trim(),
      hasFromEmail: !!fromEmail,
      // safe to expose from address — not a secret
      fromEmail: fromEmail || null,
    },
  });
});

module.exports = router;
