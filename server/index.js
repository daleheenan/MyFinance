import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, existsSync } from 'fs';
import { initDb, getDb, setDb } from './core/database.js';
import { errorHandler, notFoundHandler } from './core/errors.js';
import { setupMiddleware } from './core/middleware.js';

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

export function createApp(db = null) {
  const app = express();

  // Use provided db or initialize
  if (db) {
    setDb(db);
  } else {
    initDb();
  }

  // Setup middleware
  setupMiddleware(app);

  // Serve static files
  app.use(express.static(join(__dirname, '../public')));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  });

  // Register pre-loaded feature routes
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
const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMain) {
  const PORT = process.env.PORT || 3000;
  const app = createApp();

  app.listen(PORT, () => {
    console.log(`FinanceFlow running on http://localhost:${PORT}`);
  });
}
