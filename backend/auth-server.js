// Authentication Service
class AuthService {
  constructor() {
    this.currentUser = null;
    this.recaptchaVerifier = null;
    this.init();
  }

  init() {
    const { auth, onAuthStateChanged } = window.firebaseAuth;

    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;
      if (user) {
        console.log('User signed in:', user.uid);
        this.updateUserLastLogin(user.uid);
      } else {
        console.log('User signed out');
      }
    });
  }

  // Email PIN Authentication
  async requestEmailPin(email, name) {
    try {
      const response = await fetch('https://wildlife-auth-server.vercel.app/api/auth/request-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, name })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send PIN');
      }

      return { success: true, message: 'PIN sent to your email' };
    } catch (error) {
      console.error('Email PIN request failed:', error);
      throw error;
    }
  }

  async verifyEmailPin(email, pin) {
    try {
      const response = await fetch('https://wildlife-auth-server.vercel.app/api/auth/verify-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, pin })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Invalid PIN');
      }

      const data = await response.json();
      const { signInWithCustomToken } = window.firebaseAuth;

      // Sign in with custom token
      const result = await signInWithCustomToken(window.firebaseAuth.auth, data.customToken);

      // Create/update user document
      await this.createOrUpdateUser(result.user, { email, name: data.name });

      return { success: true, user: result.user };
    } catch (error) {
      console.error('Email PIN verification failed:', error);
      throw error;
    }
  }

  // Phone Authentication
  async requestPhoneOtp(phoneNumber, name) {
    try {
      // Initialize reCAPTCHA if not already done
      if (!this.recaptchaVerifier) {
        this.recaptchaVerifier = new window.firebaseAuth.RecaptchaVerifier(
          'recaptcha-container',
          {
            size: 'invisible',
            callback: () => {
              console.log('reCAPTCHA solved');
            }
          },
          window.firebaseAuth.auth
        );
      }

      const phoneNumberFormatted = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      const confirmationResult = await window.firebaseAuth.signInWithPhoneNumber(
        window.firebaseAuth.auth,
        phoneNumberFormatted,
        this.recaptchaVerifier
      );

      this.confirmationResult = confirmationResult;

      // Create/update user document for phone auth
      // We'll update it properly after successful verification
      const tempUserData = {
        name,
        email: null,
        phone: phoneNumberFormatted,
        status: 'active',
        registeredAt: window.firebaseAuth.serverTimestamp(),
        lastLogin: null // Will be set after verification
      };

      // Store temporarily - will be updated after verification
      sessionStorage.setItem('pendingPhoneUser', JSON.stringify(tempUserData));

      return { success: true, message: 'OTP sent to your phone' };
    } catch (error) {
      console.error('Phone OTP request failed:', error);
      throw new Error(`Failed to send OTP: ${error.message}`);
    }
  }

  async verifyPhoneOtp(otp) {
    try {
      if (!this.confirmationResult) {
        throw new Error('No OTP request found. Please request OTP first.');
      }

      const result = await this.confirmationResult.confirm(otp);

      // Update user document with phone auth data
      const pendingUserData = JSON.parse(sessionStorage.getItem('pendingPhoneUser'));
      if (pendingUserData) {
        await this.createOrUpdateUser(result.user, pendingUserData);
        sessionStorage.removeItem('pendingPhoneUser');
      }

      return { success: true, user: result.user };
    } catch (error) {
      console.error('Phone OTP verification failed:', error);
      throw new Error(`Invalid OTP: ${error.message}`);
    }
  }

  // User Management
  async createOrUpdateUser(user, userData) {
    const { doc, setDoc, updateDoc, serverTimestamp } = window.firebaseAuth;

    const userDoc = {
      name: userData.name,
      email: userData.email,
      phone: userData.phone || null,
      status: 'active',
      registeredAt: userData.registeredAt || serverTimestamp(),
      lastLogin: serverTimestamp()
    };

    try {
      await setDoc(doc(window.firebaseAuth.db, 'users', user.uid), userDoc, { merge: true });
      console.log('User document created/updated:', user.uid);
    } catch (error) {
      console.error('Failed to create/update user document:', error);
      throw error;
    }
  }

  async updateUserLastLogin(uid) {
    const { doc, updateDoc, serverTimestamp } = window.firebaseAuth;

    try {
      await updateDoc(doc(window.firebaseAuth.db, 'users', uid), {
        lastLogin: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to update last login:', error);
    }
  }

  async checkUserStatus() {
    if (!this.currentUser) return null;

    const { doc, getDoc } = window.firebaseAuth;

    try {
      const userDoc = await getDoc(doc(window.firebaseAuth.db, 'users', this.currentUser.uid));
      if (userDoc.exists()) {
        return userDoc.data();
      }
      return null;
    } catch (error) {
      console.error('Failed to check user status:', error);
      return null;
    }
  }

  async signOut() {
    const { signOut } = window.firebaseAuth;
    await signOut(window.firebaseAuth.auth);
    this.currentUser = null;
  }

  isAuthenticated() {
    return !!this.currentUser;
  }
}

// Create global instance
window.authService = new AuthService();
