/**
 * State Manager for FinanceFlow
 * Simple pub/sub pattern for reactive state management
 */

class State {
  constructor() {
    this.state = {};
    this.listeners = new Map();
  }

  /**
   * Get a value from state
   * @param {string} key - State key
   * @returns {any} - State value or undefined
   */
  get(key) {
    return this.state[key];
  }

  /**
   * Set a value in state and notify subscribers
   * @param {string} key - State key
   * @param {any} value - New value
   */
  set(key, value) {
    const oldValue = this.state[key];
    this.state[key] = value;

    // Only notify if value actually changed
    if (oldValue !== value) {
      this._notify(key, value, oldValue);
    }
  }

  /**
   * Subscribe to changes for a specific key
   * @param {string} key - State key to watch
   * @param {function} callback - Called with (newValue, oldValue) when key changes
   * @returns {function} - Unsubscribe function
   */
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }

    this.listeners.get(key).add(callback);

    // Return unsubscribe function
    return () => {
      const keyListeners = this.listeners.get(key);
      if (keyListeners) {
        keyListeners.delete(callback);
        // Clean up empty listener sets
        if (keyListeners.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  /**
   * Notify all subscribers of a key change
   * @param {string} key - State key
   * @param {any} newValue - New value
   * @param {any} oldValue - Previous value
   */
  _notify(key, newValue, oldValue) {
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      keyListeners.forEach(callback => {
        try {
          callback(newValue, oldValue);
        } catch (err) {
          console.error(`State subscriber error for key "${key}":`, err);
        }
      });
    }
  }

  /**
   * Clear all state (useful for logout/reset)
   */
  clear() {
    this.state = {};
    // Don't clear listeners - they may want to react to the reset
  }

  /**
   * Get all current state (for debugging)
   * @returns {object} - Copy of current state
   */
  getAll() {
    return { ...this.state };
  }
}

// Export singleton instance
export const state = new State();
