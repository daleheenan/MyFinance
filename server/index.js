import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, existsSync } from 'fs';
import { initDb, getDb, setDb } from './core/database.js';
import { errorHandler, notFoundHandler } from './core/errors.js';
import { setupMiddleware } from './core/middleware.js';
import { setupSecurity, setupTrustProxy } from './core/security.js';
import { requireAuth } from './features/auth/auth.middleware.js';
import { createInitialUser, cleanupExpiredSessions } from './features/auth/auth.service.js';
import authRouter from './features/auth/auth.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  const { skipAuth = false } = options; // Allow tests to skip auth

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

  // Auth routes (public - handles its own auth for protected endpoints)
  app.use('/api/auth', authRouter);
  console.log('Registered: /api/auth');

  // Apply authentication middleware to all other API routes
  if (!skipAuth) {
    app.use('/api', requireAuth);
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
    console.log(`FinanceFlow server listening on port ${PORT}`);
    console.log(`Health check available at /api/health`);

    // In production, the public URL is configured via Railway/custom domain
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      console.log(`Public URL: https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }

    // Create initial admin user if none exists
    try {
      const result = await createInitialUser();
      if (result.created) {
        console.log('');
        console.log('========================================');
        console.log('  INITIAL ADMIN USER CREATED');
        console.log('========================================');
        console.log(`  Username: ${result.username}`);
        console.log(`  Password: ${result.password}`);
        console.log('');
        console.log('  Please change this password immediately!');
        console.log('========================================');
        console.log('');
      }
    } catch (err) {
      console.error('Failed to create initial user:', err.message);
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
