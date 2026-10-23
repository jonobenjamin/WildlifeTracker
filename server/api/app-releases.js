const express = require('express');
const { getStorage } = require('firebase-admin/storage');
const { createFieldAuth } = require('../middleware/fieldAuth');
const { normalizeRole } = require('../lib/rbac');

const COLLECTION = 'app_releases';
const ANDROID_DOC = 'android';
const MAX_APK_BYTES = 80 * 1024 * 1024;
const APK_CONTENT_TYPE = 'application/vnd.android.package-archive';

function requireAdmin(req, res) {
  if (normalizeRole(req.authRole) !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Admin role required to publish the Android app',
    });
    return false;
  }
  return true;
}

function sanitizeFileName(name) {
  const base = String(name || 'KPR-monitor.apk')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  if (!base.toLowerCase().endsWith('.apk')) return `${base || 'KPR-monitor'}.apk`;
  return base.slice(0, 120);
}

function publicPayload(data = {}) {
  return {
    platform: 'android',
    versionName: data.versionName || '',
    versionCode: Number(data.versionCode) || 0,
    fileName: data.fileName || 'KPR-monitor.apk',
    downloadUrl: data.downloadUrl || null,
    sizeBytes: Number(data.sizeBytes) || 0,
    uploadedAt: data.uploadedAt || null,
    notes: data.notes || '',
  };
}

async function ensureBucketCors(bucket) {
  try {
    await bucket.setCorsConfiguration([
      {
        origin: ['*'],
        method: ['GET', 'HEAD', 'PUT', 'POST', 'OPTIONS'],
        responseHeader: ['Content-Type', 'Content-Disposition', 'x-goog-resumable'],
        maxAgeSeconds: 3600,
      },
    ]);
  } catch (err) {
    console.warn('app-releases: could not update storage CORS:', err.message);
  }
}

function publicFileUrl(bucketName, storagePath) {
  return `https://storage.googleapis.com/${bucketName}/${encodeURI(storagePath)}`;
}

module.exports = (db) => {
  const router = express.Router();
  const requireAuth = createFieldAuth(db);

  router.get('/android', async (_req, res) => {
    try {
      if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
      const snap = await db.collection(COLLECTION).doc(ANDROID_DOC).get();
      if (!snap.exists) return res.json({ success: true, data: null });
      res.json({ success: true, data: publicPayload(snap.data()) });
    } catch (error) {
      console.error('GET /api/app-releases/android error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to load Android app' });
    }
  });

  router.get('/android/file', async (_req, res) => {
    try {
      if (!db) return res.status(503).json({ success: false, error: 'Database not available' });
      const snap = await db.collection(COLLECTION).doc(ANDROID_DOC).get();
      const url = snap.exists ? snap.data()?.downloadUrl : null;
      if (!url) {
        return res.status(404).json({ success: false, error: 'No Android app published yet' });
      }
      res.redirect(302, url);
    } catch (error) {
      console.error('GET /api/app-releases/android/file error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to download Android app' });
    }
  });

  router.post('/android/upload-url', requireAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const versionName = String(req.body.versionName || '').trim();
      const versionCode = Number(req.body.versionCode);
      const sizeBytes = Number(req.body.sizeBytes) || 0;
      const fileName = sanitizeFileName(req.body.fileName);
      const contentType = APK_CONTENT_TYPE;

      if (!versionName) {
        return res.status(400).json({ success: false, error: 'versionName is required' });
      }
      if (!Number.isFinite(versionCode) || versionCode < 1) {
        return res.status(400).json({ success: false, error: 'versionCode must be a positive number' });
      }
      if (sizeBytes > MAX_APK_BYTES) {
        return res.status(400).json({
          success: false,
          error: `APK must be ${Math.round(MAX_APK_BYTES / (1024 * 1024))} MB or smaller`,
        });
      }

      const storagePath = `app-releases/android/${versionCode}_${fileName}`;
      const bucket = getStorage().bucket();
      await ensureBucketCors(bucket);
      const file = bucket.file(storagePath);
      const [uploadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 20 * 60 * 1000,
        contentType,
      });

      res.json({
        success: true,
        data: {
          uploadUrl,
          storagePath,
          contentType,
          versionName,
          versionCode,
          fileName,
        },
      });
    } catch (error) {
      console.error('POST /api/app-releases/android/upload-url error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to start APK upload',
      });
    }
  });

  router.post('/android/complete', requireAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      if (!db) return res.status(503).json({ success: false, error: 'Database not available' });

      const versionName = String(req.body.versionName || '').trim();
      const versionCode = Number(req.body.versionCode);
      const storagePath = String(req.body.storagePath || '').trim();
      const fileName = sanitizeFileName(req.body.fileName);
      const notes = String(req.body.notes || '').trim();
      const contentType = APK_CONTENT_TYPE;

      if (!storagePath.startsWith('app-releases/android/')) {
        return res.status(400).json({ success: false, error: 'Invalid storage path' });
      }
      if (!versionName || !Number.isFinite(versionCode) || versionCode < 1) {
        return res.status(400).json({ success: false, error: 'versionName and versionCode are required' });
      }

      const bucket = getStorage().bucket();
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(400).json({
          success: false,
          error: 'Upload did not finish — pick the APK and try again',
        });
      }

      await file.setMetadata({
        contentType,
        contentDisposition: `attachment; filename="${fileName}"`,
      });

      let downloadUrl = publicFileUrl(bucket.name, storagePath);
      try {
        await file.makePublic();
      } catch {
        const [signed] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
        });
        downloadUrl = signed;
      }

      const [metadata] = await file.getMetadata();
      const doc = {
        platform: 'android',
        versionName,
        versionCode,
        fileName,
        storagePath,
        downloadUrl,
        sizeBytes: Number(metadata.size || 0),
        contentType,
        notes,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.authUid || null,
      };
      await db.collection(COLLECTION).doc(ANDROID_DOC).set(doc);
      res.json({ success: true, data: publicPayload(doc) });
    } catch (error) {
      console.error('POST /api/app-releases/android/complete error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to publish Android app',
      });
    }
  });

  return router;
};
