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

  const features = readdirSync(featuresPath, { withFileTypes: true })
    .filter(d => d.isDirectory())
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
  <title>${page.meta_title || page.title} - Flow Finance Manager</title>
  <meta name="description" content="${page.meta_description || ''}">
  <link rel="stylesheet" href="/marketing/css/marketing.css">
  <style>${page.css || ''}</style>
</head>
<body>
  <header class="marketing-header">
    <nav class="marketing-nav">
      <a href="/" class="marketing-logo">Flow Finance</a>
      <div class="marketing-nav-links">
        <a href="/features">Features</a>
        <a href="/pricing">Pricing</a>
        <a href="/app#/login" class="btn btn-primary">Sign In</a>
      </div>
    </nav>
  </header>
  <main class="cms-page-content">
    ${page.content}
  </main>
  <footer class="marketing-footer">
    <p>&copy; ${new Date().getFullYear()} Flow Finance Manager. All rights reserved.</p>
  </footer>
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
