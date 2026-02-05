require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK (serverless-safe)
let db;

function initializeFirebase() {
  if (!admin.apps.length) {
    // Firebase not initialized yet - ONLY use environment variable (no file loading)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        console.log('FIREBASE_SERVICE_ACCOUNT_KEY length:', process.env.FIREBASE_SERVICE_ACCOUNT_KEY.length);

        // Try to clean up the JSON string if needed
        let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();

        // Remove any surrounding quotes that might have been added accidentally
        if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
          jsonString = jsonString.slice(1, -1);
        }

        // Unescape any escaped quotes
        jsonString = jsonString.replace(/\\"/g, '"');

        const serviceAccount = JSON.parse(jsonString);
        console.log('Successfully parsed service account from environment variable');

        // Validate required fields
        const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
        const missingFields = requiredFields.filter(field => !serviceAccount[field]);

        if (missingFields.length > 0) {
          console.error('Service account missing required fields:', missingFields);
          throw new Error(`Service account missing fields: ${missingFields.join(', ')}`);
        }

        console.log('Service account validation passed for project:', serviceAccount.project_id);

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || 'wildlifetracker-4d28b'}.firebaseio.com`
        });
        console.log('Firebase Admin SDK initialized successfully');

      } catch (error) {
        console.error('Failed to initialize Firebase:', error.message);
        throw error;
      }
    } else {
      console.error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable not set!');
      throw new Error('Firebase service account key not configured');
    }
  }

  return admin.firestore();
}

// Initialize Firebase safely
try {
  initializeFirebase();
  // Access the named database
  db = admin.firestore();

  // Handle serverless environment where settings might already be configured
  try {
    db.settings({ databaseId: 'wildlifetracker-db' });
  } catch (settingsError) {
    console.log('Firebase settings already configured, continuing...');
  }

  console.log('Firebase initialized successfully with database: wildlifetracker-db');
} catch (error) {
  console.error('Failed to initialize Firebase:', error.message);
  console.log('Continuing without Firebase for testing map endpoints...');
  db = null; // Set db to null so routes that need it will fail gracefully
}
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// CORS middleware for Vercel serverless functions
app.set('trust proxy', 1); // Trust Vercel proxy for rate limiting

app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS ?
    process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) :
    ['http://localhost:3000', 'http://localhost:5000'];

  const origin = req.headers.origin;

  // Check if the requesting origin is allowed
  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Wildlife Tracker API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      observations: '/api/observations (POST only - write-only)',
      test: '/test'
    },
    docs: 'See README.md for API documentation'
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    message: 'Vercel deployment working!',
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      hasApiKey: !!process.env.API_KEY,
      hasFirebaseProject: !!process.env.FIREBASE_PROJECT_ID,
      hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/observations', require('./api/observations')(db));
app.use('/api/map', require('./api/map'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// For Vercel serverless functions, we export the app
// For local development, we can still listen
if (require.main === module) {
  // This runs when the file is executed directly (local development)
  app.listen(PORT, () => {
    console.log(`🚀 Wildlife Tracker API running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
