/**
 * Hash-based Router for FinanceFlow SPA
 * Handles routing between pages using URL hash fragments
 */

class Router {
  constructor() {
    this.routes = new Map();
    this.currentPage = null;
    this.notFoundHandler = null;

    // Bind hashchange event
    this._onHashChange = this._onHashChange.bind(this);
    window.addEventListener('hashchange', this._onHashChange);
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
  navigate() {
    const { path, params } = this.parseHash();
    const container = document.getElementById('app');

    if (!container) {
      console.error('Router: #app container not found');
      return;
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
    pageModule.mount(container, params);

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
  start() {
    // Set default route if no hash
    if (!window.location.hash) {
      window.location.hash = '/overview';
    } else {
      this.navigate();
    }
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
