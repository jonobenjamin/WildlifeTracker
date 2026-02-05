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
          databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || 'wildlifetracker-4d28b'}.firebaseio.com`,
          storageBucket: `${process.env.FIREBASE_PROJECT_ID || 'wildlifetracker-4d28b'}.firebasestorage.app`
        });
        console.log('Firebase Admin SDK initialized successfully with Storage');

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

  // Test Firebase Storage initialization
  try {
    console.log('🔍 Initializing Firebase Storage...');
    const storage = admin.storage();
    const bucket = storage.bucket();

    console.log('📦 Storage bucket configured:', bucket.name);
    console.log('🎯 Target bucket: wildlifetracker-4d28b.firebasestorage.app');
    console.log('✅ Bucket name matches:', bucket.name === 'wildlifetracker-4d28b.firebasestorage.app');

    // Test if bucket exists and is accessible
    const [exists] = await bucket.exists();
    console.log('✅ Storage bucket exists in Firebase:', exists);

    if (!exists) {
      console.error('❌ CRITICAL: Firebase Storage bucket does not exist!');
      console.error('🔧 SOLUTION: Go to Firebase Console > Storage > Get started');
      console.error('   Create a bucket with default settings');
      console.error('   Image uploads will NOT work until bucket exists!');
    } else {
      console.log('✅ Firebase Storage is ready for image uploads');

      // Test bucket permissions with a simple operation
      try {
        const [files] = await bucket.getFiles({ maxResults: 1 });
        console.log('✅ Storage bucket permissions OK (can list files)');
        console.log('📊 Current files in bucket:', files.length);
      } catch (permError) {
        console.warn('⚠️  Storage bucket permissions issue:', permError.message);
        console.warn('   This might cause image upload failures');
        console.warn('   Check service account has Storage permissions');
      }
    }
  } catch (storageError) {
    console.error('❌ Failed to initialize Firebase Storage:', storageError.message);
    console.error('   This means image uploads will fail!');
    console.error('🔧 TROUBLESHOOTING:');
    console.error('   1. Check Firebase project has Storage enabled');
    console.error('   2. Verify service account has Storage permissions');
    console.error('   3. Check Storage security rules allow operations');
  }

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
      images: '/api/observations/:id/image (secure image access)',
      test: '/test',
      testStorage: '/test-storage (Firebase Storage diagnostic)'
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

// Test Firebase Storage endpoint
app.get('/test-storage', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({
        error: 'Firebase not initialized',
        message: 'Cannot test storage without Firebase'
      });
    }

    console.log('🧪 Testing Firebase Storage from deployed app...');

    const storage = admin.storage();
    const bucket = storage.bucket();

    console.log('📦 Bucket name:', bucket.name);
    console.log('🔍 Expected: wildlifetracker-4d28b.firebasestorage.app');
    console.log('✅ Bucket name correct:', bucket.name === 'wildlifetracker-4d28b.firebasestorage.app');

    const [exists] = await bucket.exists();
    console.log('✅ Bucket exists:', exists);

    if (!exists) {
      return res.status(500).json({
        error: 'Storage bucket does not exist',
        bucket: bucket.name,
        expected: 'wildlifetracker-4d28b.firebasestorage.app',
        solution: 'Create bucket in Firebase Console > Storage'
      });
    }

    // Test upload like image upload does
    const testFileName = `test/deploy-test-${Date.now()}.txt`;
    const testFile = bucket.file(testFileName);

    console.log('📤 Testing upload to:', testFileName);

    await testFile.save('Deployed app storage test', {
      metadata: { contentType: 'text/plain' }
    });

    console.log('✅ Upload test passed');

    // Clean up
    await testFile.delete();
    console.log('🧹 Cleaned up test file');

    res.json({
      success: true,
      message: 'Firebase Storage is working!',
      bucket: {
        name: bucket.name,
        exists: exists,
        uploadTest: 'passed',
        correctName: bucket.name === 'wildlifetracker-4d28b.firebasestorage.app'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Storage test failed:', error);
    res.status(500).json({
      error: 'Storage test failed',
      message: error.message,
      code: error.code,
      bucket: 'wildlifetracker-4d28b.firebasestorage.app',
      troubleshooting: [
        'Check Firebase Console > Storage > Create bucket',
        'Verify bucket name is exactly: wildlifetracker-4d28b.firebasestorage.app',
        'Check service account has Storage permissions',
        'Verify Storage security rules allow admin access'
      ]
    });
  }
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
