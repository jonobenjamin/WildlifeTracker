const express = require('express');
const admin = require('firebase-admin');

const router = express.Router();

// Middleware to check for admin authentication
const requireAdmin = async (req, res, next) => {
  try {
    // Check for admin token in Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the admin token
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Check if user has admin role (you can extend this with custom claims)
    // For now, we'll accept any authenticated user as admin
    // In production, you should check for admin role in custom claims

    req.adminUid = decodedToken.uid;
    next();
  } catch (error) {
    console.error('Admin authentication failed:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid admin token'
    });
  }
};

// Get all users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const db = admin.firestore();

    // Get all users from the users collection
    const usersSnapshot = await db.collection('users')
      .orderBy('registeredAt', 'desc')
      .get();

    const users = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      users.push({
        id: doc.id,
        uid: userData.uid,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        role: userData.role || 'user',
        status: userData.status || 'active',
        registeredAt: userData.registeredAt,
        lastLogin: userData.lastLogin
      });
    });

    // Calculate stats
    const stats = {
      total: users.length,
      active: users.filter(u => u.status === 'active').length,
      revoked: users.filter(u => u.status === 'revoked').length
    };

    res.json({
      success: true,
      users: users,
      stats: stats
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// Update user status (revoke/restore)
router.patch('/users/:userId/status', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    if (!['active', 'revoked'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "active" or "revoked"'
      });
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);

    // Check if user exists
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user status
    await userRef.update({
      status: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.adminUid
    });

    res.json({
      success: true,
      message: `User ${status === 'revoked' ? 'revoked' : 'restored'} successfully`,
      userId: userId,
      status: status
    });

  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
});

// Delete user (hard delete - use with caution)
router.delete('/users/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);

    // Check if user exists
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete user document
    await userRef.delete();

    // Note: You might also want to delete from Firebase Auth
    // await admin.auth().deleteUser(userId);

    res.json({
      success: true,
      message: 'User deleted successfully',
      userId: userId
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
});

// Get user details
router.get('/users/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = userDoc.data();

    res.json({
      success: true,
      user: {
        id: userDoc.id,
        uid: userData.uid,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        role: userData.role || 'user',
        status: userData.status || 'active',
        registeredAt: userData.registeredAt,
        lastLogin: userData.lastLogin
      }
    });

  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details'
    });
  }
});

module.exports = router;
