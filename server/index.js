import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { initDb, getDb, setDb } from './core/database.js';
import { errorHandler, notFoundHandler } from './core/errors.js';
import { setupMiddleware } from './core/middleware.js';
import { setupSecurity, setupTrustProxy } from './core/security.js';
import { requireAuth } from './features/auth/auth.middleware.js';
import { cleanupExpiredSessions } from './features/auth/auth.service.js';
import { csrfProtection } from './core/csrf.js';
import authRouter from './features/auth/auth.routes.js';
import cmsRouter from './features/cms/cms.routes.js';
import contactRouter from './features/contact/contact.routes.js';
import billingRouter from './features/billing/billing.routes.js';
import { getPublishedPageBySlug } from './features/cms/cms.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
const APP_VERSION = packageJson.version;

// Pre-load all feature routes synchronously at module load time
const featureRouters = new Map();

async function preloadRoutes() {
  const featuresPath = join(__dirname, 'features');

  if (!existsSync(featuresPath)) {
    return;
  }

  // Exclude features that are registered manually (auth, cms, contact, billing)
  const manualFeatures = ['auth', 'cms', 'contact', 'billing'];
  const features = readdirSync(featuresPath, { withFileTypes: true })
    .filter(d => d.isDirectory() && !manualFeatures.includes(d.name))
    .map(d => d.name);

  for (const feature of features) {
    const routePath = join(featuresPath, feature, `${feature}.routes.js`);

    if (existsSync(routePath)) {
      try {
        const module = await import(`file://${routePath}`);
        featureRouters.set(feature, module.default);
      } catch (err) {
        console.error(`Failed to load ${feature} routes:`, err.message);
      }
    }
  }
}

// Preload routes immediately
await preloadRoutes();

export function createApp(db = null, options = {}) {
  const app = express();
  const { skipAuth = false, skipCsrf = false } = options; // Allow tests to skip auth/csrf

  // Trust proxy for Railway/reverse proxies
  setupTrustProxy(app);

  // Use provided db or initialize
  if (db) {
    setDb(db);
  } else {
    initDb();
  }

  // Setup security middleware (helmet, rate limiting)
  setupSecurity(app);

  // Setup other middleware (json parsing, CORS)
  setupMiddleware(app);

  // ==========================================================================
  // Marketing Routes (BEFORE static files - serve explicit routes first)
  // ==========================================================================

  // Marketing landing page
  app.get('/', (req, res) => {
    res.sendFile(join(__dirname, '../public/marketing/index.html'));
  });

  // Marketing features page
  app.get('/features', (req, res) => {
    res.sendFile(join(__dirname, '../public/marketing/features.html'));
  });

  // Marketing pricing page
  app.get('/pricing', (req, res) => {
    res.sendFile(join(__dirname, '../public/marketing/pricing.html'));
  });

  // Marketing about page
  app.get('/about', (req, res) => {
    res.sendFile(join(__dirname, '../public/marketing/about.html'));
  });

  // Marketing contact page
  app.get('/contact', (req, res) => {
    res.sendFile(join(__dirname, '../public/marketing/contact.html'));
  });

  // Registration page
  app.get('/register', (req, res) => {
    res.sendFile(join(__dirname, '../public/marketing/register.html'));
  });

  // Forgot password page
  app.get('/forgot-password', (req, res) => {
    res.sendFile(join(__dirname, '../public/marketing/forgot-password.html'));
  });

  // Reset password page
  app.get('/reset-password', (req, res) => {
    res.sendFile(join(__dirname, '../public/marketing/reset-password.html'));
  });

  // Account recovery page (set email for accounts without one)
  app.get('/account-recovery', (req, res) => {
    res.sendFile(join(__dirname, '../public/marketing/account-recovery.html'));
  });

  // Dynamic CMS pages (public, fetched from database)
  app.get('/page/:slug', (req, res) => {
    const db = getDb();
    const page = getPublishedPageBySlug(db, req.params.slug);

    if (!page) {
      return res.status(404).send('Page not found');
    }

    // Render a simple HTML page with the CMS content
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.meta_title || page.title} - FinanceFlow</title>
  <meta name="description" content="${page.meta_description || ''}">
  <link rel="stylesheet" href="/marketing/css/marketing.css">
  <style>${page.css || ''}</style>
</head>
<body>
  <header class="marketing-header">
    <nav class="marketing-nav">
      <a href="/" class="marketing-logo">
        <span class="marketing-logo-icon">&#163;</span>
        FinanceFlow
      </a>
      <button class="marketing-nav-toggle" aria-label="Toggle navigation" data-action="nav-toggle">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <div class="marketing-nav-links">
        <a href="/features">Features</a>
        <a href="/pricing">Pricing</a>
        <a href="/about">About</a>
        <a href="#" class="btn btn-primary" data-action="sign-in">Sign In</a>
      </div>
    </nav>
  </header>
  <main class="cms-page-content">
    ${page.content}
  </main>
  <footer class="marketing-footer">
    <div class="marketing-footer-content">
      <div class="marketing-footer-links">
        <a href="/page/privacy">Privacy</a>
        <a href="/page/terms">Terms</a>
        <a href="/contact">Contact</a>
      </div>
      <p>&copy; ${new Date().getFullYear()} FinanceFlow. All rights reserved.</p>
    </div>
  </footer>
  <div id="signInModal" class="modal-overlay">
    <div class="modal-content">
      <button class="modal-close" aria-label="Close modal">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div class="modal-header">
        <h2>Welcome Back</h2>
        <p>Sign in to your FinanceFlow account</p>
      </div>
      <div class="modal-body">
        <form id="signInForm">
          <div class="form-group">
            <label for="email">Email or Username</label>
            <input type="text" id="email" name="email" placeholder="Enter your email or username" required>
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" placeholder="Enter your password" required>
          </div>
          <div id="formError" class="form-error">Invalid email or password. Please try again.</div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-lg">Sign In</button>
          </div>
          <div class="form-links">
            <a href="/forgot-password">Forgot Password?</a>
          </div>
          <div class="form-divider">
            <span>or</span>
          </div>
          <div class="form-links">
            Don't have an account? <a href="/register">Create Account</a>
          </div>
        </form>
      </div>
    </div>
  </div>
  <script src="/marketing/js/modal.js"></script>
</body>
</html>`;

    res.send(html);
  });

  // App entry point - serve SPA shell
  app.get('/app', (req, res) => {
    res.sendFile(join(__dirname, '../public/index.html'));
  });

  // App routes (SPA catch-all for /app/*)
  app.get('/app/{*path}', (req, res) => {
    res.sendFile(join(__dirname, '../public/index.html'));
  });

  // ==========================================================================
  // Static Files
  // ==========================================================================

  // Serve static files
  app.use(express.static(join(__dirname, '../public')));

  // Health check (public)
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  });

  // Version endpoint (public)
  app.get('/api/version', (req, res) => {
    res.json({
      version: APP_VERSION,
      name: 'Flow Finance Manager'
    });
  });

  // Auth routes (public - handles its own auth for protected endpoints)
  app.use('/api/auth', authRouter);
  console.log('Registered: /api/auth');

  // CMS routes (public page fetch + admin routes with internal auth)
  app.use('/api/cms', cmsRouter);
  console.log('Registered: /api/cms');

  // Contact routes (public POST + admin routes with internal auth)
  app.use('/api/contact', contactRouter);
  console.log('Registered: /api/contact');

  // Billing routes (public config + webhook + protected routes with internal auth)
  app.use('/api/billing', billingRouter);
  console.log('Registered: /api/billing');

  // Apply authentication and CSRF protection to all other API routes
  if (!skipAuth) {
    app.use('/api', requireAuth);
  }
  if (!skipCsrf) {
    app.use('/api', csrfProtection);
  }

  // Register pre-loaded feature routes (now protected)
  for (const [feature, router] of featureRouters) {
    app.use(`/api/${feature}`, router);
    console.log(`Registered: /api/${feature}`);

    // Check for additional sub-routers (e.g., category-rules)
    if (router.rulesRouter) {
      app.use('/api/category-rules', router.rulesRouter);
      console.log(`Registered: /api/category-rules`);
    }
  }

  // Error handling (must be after routes)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// Start server if run directly
// Note: In production containers, this file is the entry point
const isMain = process.argv[1]?.endsWith('index.js') ||
               import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`;

if (isMain) {
  const PORT = process.env.PORT || 3000;
  const HOST = '0.0.0.0'; // Bind to all interfaces for Railway/Docker
  const app = createApp();

  const server = app.listen(PORT, HOST, async () => {
    console.log(`Flow Finance Manager server listening on port ${PORT}`);
    console.log(`Health check available at /api/health`);

    // In production, the public URL is configured via Railway/custom domain
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      console.log(`Public URL: https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }

    // Clean up expired sessions on startup
    try {
      const cleanup = cleanupExpiredSessions();
      if (cleanup.cleaned > 0) {
        console.log(`Cleaned up ${cleanup.cleaned} expired sessions`);
      }
    } catch (err) {
      console.error('Session cleanup failed:', err.message);
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}
