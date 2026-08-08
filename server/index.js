/**
 * The original Wildlife Tracker Express API, unchanged in behaviour.
 * Mounted into Next.js via pages/api/[...path].js so the whole backend
 * ships inside this one app/repo and deploys as part of the same Vercel project.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');
const { getDb } = require('./firestoreDb');

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
        const missingFields = requiredFields.filter((field) => !serviceAccount[field]);
        if (missingFields.length > 0) {
          throw new Error(`Service account missing fields: ${missingFields.join(', ')}`);
        }

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || 'wildlifetracker-4d28b'}.firebaseio.com`,
          storageBucket: `${process.env.FIREBASE_PROJECT_ID || 'wildlifetracker-4d28b'}.firebasestorage.app`,
        });
        console.log('Firebase Admin SDK initialized');
      } catch (error) {
        console.error('Failed to initialize Firebase:', error.message);
        throw error;
      }
    } else {
      console.error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable not set!');
      throw new Error('Firebase service account key not configured');
    }
  }
  return getDb();
}

try {
  initializeFirebase();
  db = getDb();
  console.log('Firebase initialized successfully (database: %s)', process.env.FIREBASE_DATABASE_ID || 'wildlifetracker-db');
} catch (error) {
  console.error('Failed to initialize Firebase:', error.message);
  db = null;
}

const app = express();

app.use(helmet());
app.set('trust proxy', 1);

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',
  'https://jonobenjamin.github.io',
  'https://khwaiprivate.okavangowater.com',
  'https://kpr-sightings.okavangowater.com',
  'https://khwai-private-reserve.vercel.app',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()) : []),
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes('*') ||
        origin.endsWith('jonobenjamin.github.io') ||
        origin.endsWith('.vercel.app') ||
        origin.endsWith('.okavangowater.com') ||
        origin === 'https://okavangowater.com'
      ) {
        return cb(null, true);
      }
      cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'x-api-key'],
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api', (req, res) => {
  res.json({
    message: 'KPR Wildlife Tracker API',
    version: '2.0.0',
    endpoints: {
      health: '/api/health',
      observations: '/api/observations',
      tracking: '/api/tracking',
      trees: '/api/trees',
      roads: '/api/roads',
      fires: '/api/fires',
      waterMonitoring: '/api/water-monitoring',
      auth: '/api/auth',
      admin: '/api/admin',
      map: '/api/map',
    },
  });
});

app.use('/api/health', require('./api/health'));
app.use('/api/notifications', require('./api/notifications'));
app.use('/api/observations', require('./api/observations')(db));
app.use('/api/map', require('./api/map'));
app.use('/api/auth', require('./api/auth'));
app.use('/api/admin', require('./api/admin'));
app.use('/api/fires', require('./api/fires')(db));
app.use('/api/cron/fire-check', require('./api/cron-fire-check'));
app.use('/api/cron/notify-flush', require('./api/cron-notify-flush'));
app.use('/api/water-monitoring', require('./api/water-monitoring')(db));
app.use('/api/tracking', require('./api/tracking')(db));
app.use('/api/trees', require('./api/trees')(db));
app.use('/api/roads', require('./api/roads')(db));
app.use('/api/okavango-water', require('./api/okavango-water'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;
