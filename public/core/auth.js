/**
 * Authentication state manager
 * Handles login, logout, session verification with CSRF protection
 */

/**
 * Get CSRF token from cookie
 */
function getCsrfToken() {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

export const auth = {
  token: null,
  user: null,
  initialized: false,

  /**
   * Initialize auth state from localStorage
   */
  init() {
    this.token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('auth_user');
    if (userStr) {
      try {
        this.user = JSON.parse(userStr);
      } catch (e) {
        this.user = null;
      }
    }
    this.initialized = true;
    return this;
  },

  /**
   * Login with username and password
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async login(username, password) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!data.success) {
        return { success: false, error: data.error || 'Login failed' };
      }

      // Store token and user (token kept for backwards compatibility, cookies preferred)
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  },

  /**
   * Logout and invalidate session
   */
  async logout() {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      };

      // Add CSRF token for logout request
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }

      await fetch('/api/auth/logout', {
        method: 'POST',
        headers,
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state regardless of server response
      this.token = null;
      this.user = null;
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }
  },

  /**
   * Verify if current session is still valid
   * @returns {Promise<boolean>}
   */
  async verify() {
    // Try to verify with either cookie or token
    try {
      const response = await fetch('/api/auth/verify', {
        headers: {
          'Authorization': `Bearer ${this.token || ''}`
        },
        credentials: 'include'
      });

      const data = await response.json();

      if (!data.valid) {
        // Session invalid, clear local state
        this.token = null;
        this.user = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        return false;
      }

      // Update user info if provided
      if (data.user) {
        this.user = data.user;
        localStorage.setItem('auth_user', JSON.stringify(data.user));
      }

      return true;
    } catch (error) {
      console.error('Verify error:', error);
      return false;
    }
  },

  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!this.token && !!this.user;
  },

  /**
   * Get current auth token
   * @returns {string|null}
   */
  getToken() {
    return this.token;
  },

  /**
   * Get current user
   * @returns {object|null}
   */
  getUser() {
    return this.user;
  },

  /**
   * Change password
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async changePassword(currentPassword, newPassword) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      };

      // Add CSRF token
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }

      const response = await fetch('/api/auth/password', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to change password' };
      }

      return { success: true };
    } catch (error) {
      console.error('Change password error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  },

  /**
   * Get login history
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getLoginHistory(limit = 50) {
    try {
      const response = await fetch(`/api/auth/login-history?limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        },
        credentials: 'include'
      });

      const data = await response.json();
      return data.success ? data.history : [];
    } catch (error) {
      console.error('Login history error:', error);
      return [];
    }
  },

  /**
   * Get active sessions
   * @returns {Promise<Array>}
   */
  async getActiveSessions() {
    try {
      const response = await fetch('/api/auth/sessions', {
        headers: {
          'Authorization': `Bearer ${this.token}`
        },
        credentials: 'include'
      });

      const data = await response.json();
      return data.success ? data.sessions : [];
    } catch (error) {
      console.error('Sessions error:', error);
      return [];
    }
  },

  /**
   * Revoke a session
   * @param {number} sessionId
   * @returns {Promise<boolean>}
   */
  async revokeSession(sessionId) {
    try {
      const headers = {
        'Authorization': `Bearer ${this.token}`
      };

      // Add CSRF token
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }

      const response = await fetch(`/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Revoke session error:', error);
      return false;
    }
  }
};

// Initialize on module load
auth.init();
