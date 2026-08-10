// Authentication UI — name + password (matches APK LoginScreen)
class AuthUI {
  constructor() {
    this.currentStep = 'password-form';
    this.userData = {};
    this.init();
  }

  init() {
    this.createAuthContainer();
    // Do NOT show the overlay here — auth-controller decides when to show it.
  }

  createAuthContainer() {
    const container = document.createElement('div');
    container.id = 'auth-overlay';
    container.innerHTML = `
      <div id="auth-container">
        <div id="auth-header">
          <h2>Sign In to KPR Sighting App</h2>
        </div>
        <div id="auth-content"></div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #auth-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 16px;
        box-sizing: border-box;
      }

      #auth-container {
        background: white;
        border-radius: 16px;
        padding: 20px;
        max-width: 400px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        animation: slideUp 0.3s ease-out;
        margin: auto;
      }

      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      #auth-header h2 {
        margin: 0 0 24px 0;
        color: #333;
        font-size: 22px;
        font-weight: 600;
        text-align: center;
        line-height: 1.3;
      }

      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .form-group label {
        font-weight: 500;
        color: #555;
        font-size: 16px;
        margin-bottom: 4px;
      }

      .form-group input {
        padding: 16px 18px;
        border: 2px solid #e1e5e9;
        border-radius: 12px;
        font-size: 16px;
        transition: border-color 0.2s;
        width: 100%;
        box-sizing: border-box;
        background: #fafafa;
      }

      .form-group input:focus {
        outline: none;
        border-color: #2E7D32;
        background: white;
        box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.15);
      }

      .form-group input::placeholder {
        color: #999;
        font-size: 16px;
      }

      .password-row {
        position: relative;
      }

      .password-toggle {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        border: none;
        background: transparent;
        color: #666;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        padding: 8px;
        min-height: 44px;
      }

      .auth-button {
        background: #2E7D32;
        color: white;
        border: none;
        padding: 16px 20px;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        width: 100%;
        box-sizing: border-box;
        min-height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .auth-button:hover {
        background: #256628;
      }

      .auth-button:disabled {
        background: #ccc;
        cursor: not-allowed;
      }

      .error-message {
        color: #dc3545;
        font-size: 15px;
        margin-top: 4px;
        text-align: center;
        padding: 12px;
        background: #f8d7da;
        border-radius: 8px;
        border: 1px solid #f5c6cb;
      }

      .success-message {
        color: #28a745;
        font-size: 15px;
        margin-top: 4px;
        text-align: center;
        padding: 12px;
        background: #d4edda;
        border-radius: 8px;
        border: 1px solid #c3e6cb;
      }

      .loading {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #ffffff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      @media (max-width: 480px) {
        #auth-overlay { padding: 12px; }
        #auth-container { padding: 16px; border-radius: 12px; }
        #auth-header h2 { font-size: 20px; margin-bottom: 20px; }
        .auth-form { gap: 16px; }
        .form-group input { padding: 14px 16px; }
        .auth-button { padding: 14px 18px; min-height: 44px; }
      }

      @media (max-height: 600px) {
        #auth-container { max-height: 95vh; margin: 8px auto; }
        #auth-overlay { padding: 8px; }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(container);
  }

  /** Entry point used by auth-controller (name kept for compatibility). */
  showLoginTypeSelection() {
    this.showPasswordForm();
  }

  showPasswordForm() {
    this.currentStep = 'password-form';
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.style.display = 'flex';

    const content = document.getElementById('auth-content');
    content.innerHTML = `
      <div class="auth-form">
        <div class="form-group">
          <label for="login-name">Name</label>
          <input type="text" id="login-name" autocomplete="username" placeholder="Enter your name" required>
        </div>
        <div class="form-group">
          <label for="login-password">Password</label>
          <div class="password-row">
            <input type="password" id="login-password" autocomplete="current-password" placeholder="Enter your password" required style="padding-right: 72px;">
            <button type="button" class="password-toggle" id="password-toggle" aria-label="Show password">Show</button>
          </div>
        </div>
        <button class="auth-button" id="login-submit-btn" type="button">
          Sign in
        </button>
        <div id="login-message"></div>
      </div>
    `;

    const nameInput = document.getElementById('login-name');
    const passwordInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit-btn');
    const toggleBtn = document.getElementById('password-toggle');

    setTimeout(() => nameInput.focus(), 100);

    const submit = () => this.handlePasswordSubmit();
    submitBtn.addEventListener('click', submit);
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') passwordInput.focus();
    });

    toggleBtn.addEventListener('click', () => {
      const showing = passwordInput.type === 'text';
      passwordInput.type = showing ? 'password' : 'text';
      toggleBtn.textContent = showing ? 'Show' : 'Hide';
      toggleBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  }

  async handlePasswordSubmit() {
    const name = document.getElementById('login-name').value.trim();
    const password = document.getElementById('login-password').value;

    if (!name || !password) {
      this.showMessage('login-message', 'Name and password are required', 'error');
      return;
    }

    this.setLoading('login-submit-btn', true);

    try {
      await window.authService.loginWithPassword(name, password);
      this.showMessage('login-message', 'Sign in successful!', 'success');
      setTimeout(() => this.hideAuthAndStartApp(), 600);
    } catch (error) {
      this.showMessage('login-message', error.message || 'Login failed', 'error');
    } finally {
      this.setLoading('login-submit-btn', false);
    }
  }

  showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.className = type === 'error' ? 'error-message' : 'success-message';
    element.textContent = message;
  }

  setLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    if (loading) {
      button.disabled = true;
      button.innerHTML = '<span class="loading"></span> Please wait...';
    } else {
      button.disabled = false;
      button.textContent = 'Sign in';
    }
  }

  hideAuthAndStartApp() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.style.display = 'none';
    if (window.authController && typeof window.authController.startFlutterApp === 'function') {
      window.authController.startFlutterApp();
    }
  }

  showAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.style.display = 'flex';
  }
}

window.authUI = new AuthUI();
