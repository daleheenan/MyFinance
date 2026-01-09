import express from 'express';

export function setupMiddleware(app) {
  // Parse JSON bodies
  app.use(express.json({ limit: '10mb' }));

  // Parse URL-encoded bodies
  app.use(express.urlencoded({ extended: true }));

  // CORS for development
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
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
