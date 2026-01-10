/**
 * Hash-based Router for FinanceFlow SPA
 * Handles routing between pages using URL hash fragments
 */

class Router {
  constructor() {
    this.routes = new Map();
    this.currentPage = null;
    this.notFoundHandler = null;
    this.authCheck = null;

    // Bind hashchange event
    this._onHashChange = this._onHashChange.bind(this);
    window.addEventListener('hashchange', this._onHashChange);
  }

  /**
   * Set authentication check callback
   * @param {function} checkFn - Async function that returns true if navigation should proceed
   */
  setAuthCheck(checkFn) {
    this.authCheck = checkFn;
  }

  /**
   * Register a route with its page module
   * @param {string} path - Route path (e.g., '/overview')
   * @param {object} pageModule - Module with mount/unmount functions
   */
  register(path, pageModule) {
    this.routes.set(path, pageModule);
  }

  /**
   * Set the 404 handler
   * @param {object} pageModule - Module with mount/unmount functions
   */
  setNotFound(pageModule) {
    this.notFoundHandler = pageModule;
  }

  /**
   * Parse the current hash into path and params
   * @returns {{ path: string, params: URLSearchParams }}
   */
  parseHash() {
    const hash = window.location.hash.slice(1) || '/overview';
    const [path, queryString] = hash.split('?');
    const params = new URLSearchParams(queryString || '');
    return { path, params };
  }

  /**
   * Handle hash change event
   */
  _onHashChange() {
    this.navigate();
  }

  /**
   * Navigate to the current hash route
   */
  async navigate() {
    const { path, params } = this.parseHash();
    const container = document.getElementById('app');

    if (!container) {
      console.error('Router: #app container not found');
      return;
    }

    // Run auth check if set
    if (this.authCheck) {
      const allowed = await this.authCheck(path);
      if (!allowed) {
        return; // Auth check will handle redirect
      }
    }

    // Unmount current page
    if (this.currentPage && this.currentPage.unmount) {
      this.currentPage.unmount();
    }

    // Find matching route
    let pageModule = this.routes.get(path);

    // Handle 404
    if (!pageModule) {
      if (this.notFoundHandler) {
        pageModule = this.notFoundHandler;
      } else {
        container.innerHTML = `
          <div class="error-state">
            <h1>404</h1>
            <p>Page not found</p>
            <a href="#/overview" class="btn btn-primary">Go to Overview</a>
          </div>
        `;
        this.currentPage = null;
        this._updateActiveNav(null);
        return;
      }
    }

    // Mount new page
    this.currentPage = pageModule;
    container.innerHTML = ''; // Clear container

    // Support async mount functions
    try {
      await pageModule.mount(container, params);
    } catch (err) {
      console.error('Router: Error mounting page:', err);
      container.innerHTML = `
        <div class="error-state">
          <h1>Error</h1>
          <p>Failed to load page</p>
          <a href="#/overview" class="btn btn-primary">Go to Overview</a>
        </div>
      `;
    }

    // Update active nav link
    this._updateActiveNav(path);
  }

  /**
   * Update active state on navigation links
   * @param {string|null} currentPath - Current route path
   */
  _updateActiveNav(currentPath) {
    document.querySelectorAll('.nav-link').forEach(link => {
      const linkPath = link.getAttribute('data-route');
      if (linkPath === currentPath) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  /**
   * Programmatically navigate to a path
   * @param {string} path - Route path (e.g., '/transactions?account=1')
   */
  go(path) {
    window.location.hash = path;
  }

  /**
   * Get current route info
   * @returns {{ path: string, params: URLSearchParams }}
   */
  getCurrentRoute() {
    return this.parseHash();
  }

  /**
   * Start the router (call on DOMContentLoaded)
   */
  async start() {
    // Ensure the #app container exists before starting
    const container = document.getElementById('app');
    if (!container) {
      console.error('Router: #app container not found on start');
      return;
    }

    // Set default route if no hash - use replaceState to avoid triggering hashchange
    if (!window.location.hash || window.location.hash === '#') {
      const newUrl = window.location.pathname + window.location.search + '#/overview';
      window.history.replaceState(null, '', newUrl);
    }

    // Use requestAnimationFrame to ensure browser has painted the initial state
    // This helps prevent race conditions where DOM isn't fully ready
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    // Always call navigate on start to ensure the page renders
    await this.navigate();
  }

  /**
   * Cleanup router (remove event listeners)
   */
  destroy() {
    window.removeEventListener('hashchange', this._onHashChange);
  }
}

// Export singleton instance
export const router = new Router();
