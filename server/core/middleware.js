import express from 'express';

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://myfinance.daleheenan.com'
];

// Log warning once about development CORS
let corsWarningLogged = false;

export function setupMiddleware(app) {
  // Parse JSON bodies
  app.use(express.json({ limit: '10mb' }));

  // Parse URL-encoded bodies
  app.use(express.urlencoded({ extended: true }));

  // CORS - tightened for security
  app.use((req, res, next) => {
    const origin = req.headers.origin;

    // In production, only allow specific origins
    if (process.env.NODE_ENV === 'production') {
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
      }
    } else {
      // In development, allow localhost origins with credentials
      // Note: Cannot use wildcard (*) with credentials
      if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
      } else if (origin) {
        // For other origins in dev, allow without credentials
        res.header('Access-Control-Allow-Origin', origin);
        if (!corsWarningLogged) {
          console.warn('WARNING: Development CORS is permissive. Do not use in production.');
          corsWarningLogged = true;
        }
      }
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Request logging (development)
  if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });
  }
}
