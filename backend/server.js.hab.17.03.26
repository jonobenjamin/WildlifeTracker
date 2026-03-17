// ===== server.js =====
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');
const multer = require('multer');

// ===== Initialize Firebase =====
let db;
function initializeFirebase() {
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
        if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
          jsonString = jsonString.slice(1, -1);
        }
        jsonString = jsonString.replace(/\\"/g, '"');
        const serviceAccount = JSON.parse(jsonString);

        const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
        const missingFields = requiredFields.filter(field => !serviceAccount[field]);
        if (missingFields.length > 0) {
          throw new Error(`Service account missing fields: ${missingFields.join(', ')}`);
        }

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || 'wildlifetracker-4d28b'}.firebaseio.com`,
          storageBucket: `${process.env.FIREBASE_PROJECT_ID || 'wildlifetracker-4d28b'}.firebasestorage.app`
        });
        console.log('Firebase Admin SDK initialized');
      } catch (error) {
        console.error('Failed to initialize Firebase:', error.message);
        throw error;
      }
    } else {
      throw new Error('Firebase service account key not configured');
    }
  }
  return admin.firestore();
}

try {
  initializeFirebase();
  db = admin.firestore();
  try { db.settings({ databaseId: 'wildlifetracker-db' }); } catch {}
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase init failed, continuing without db:', error.message);
  db = null;
}

// ===== Express App Setup =====
const app = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet());
app.set('trust proxy', 1);

// ===== Fixed CORS Middleware =====
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:5000', 'https://jonobenjamin.github.io'];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key'
    );
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Always respond to preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== Root and Health Endpoints =====
app.get('/', (req, res) => {
  res.json({
    message: 'Wildlife Tracker API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      observations: '/api/observations (POST only - write-only)',
      images: '/api/observations/:id/image (secure image access)',
      testFile: '/test-file (POST - test file upload)',
      cron: '/api/cron/fire-check'
    },
    docs: 'See README.md'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ===== Test File Upload =====
const testUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('image');
app.post('/test-file', testUpload, (req, res) => {
  res.json({
    file: req.file ? {
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
      buffer: req.file.buffer ? `Present (${req.file.buffer.length} bytes)` : 'Missing'
    } : null,
    body: req.body,
    timestamp: new Date().toISOString()
  });
});

// ===== API Routes =====
// Firebase routes
app.use('/api/observations', require('./api/observations')(db));
app.use('/api/fires', require('./api/fires')(db));
app.use('/api/water-monitoring', require('./api/water-monitoring')(db));

// Other routes
app.use('/api/map', require('./api/map'));
app.use('/api/auth', require('./api/auth'));
app.use('/api/admin', require('./api/admin'));

// Cron route (no db needed)
app.use('/api/cron/fire-check', require('./api/cron-fire-check'));

// ===== Error Handling =====
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

// ===== Start Server (for local dev) =====
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Wildlife Tracker API running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
