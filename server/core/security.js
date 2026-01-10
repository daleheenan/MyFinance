import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

/**
 * Setup security middleware for the Express app
 */
export function setupSecurity(app) {
  // Security headers via Helmet
  app.use(helmet({
    // Allow inline scripts for SPA
    contentSecurityPolicy: false,
    // Required for some embedding scenarios
    crossOriginEmbedderPolicy: false,
    // Prevent clickjacking
    frameguard: { action: 'deny' },
    // Hide X-Powered-By header
    hidePoweredBy: true,
    // HSTS for HTTPS
    hsts: process.env.NODE_ENV === 'production' ? {
      maxAge: 31536000,
      includeSubDomains: true
    } : false,
    // Prevent MIME type sniffing
    noSniff: true,
    // XSS filter
    xssFilter: true
  }));

  // Rate limiting for login endpoint (strict)
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
      success: false,
      error: 'Too many login attempts. Please try again in 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Use IP from X-Forwarded-For for Railway/reverse proxies
    keyGenerator: (req) => {
      return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers['x-real-ip'] ||
             req.socket?.remoteAddress ||
             req.ip ||
             'unknown';
    }
  });

  app.use('/api/auth/login', loginLimiter);

  // General API rate limit (more permissive)
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: {
      success: false,
      error: 'Too many requests. Please slow down.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers['x-real-ip'] ||
             req.socket?.remoteAddress ||
             req.ip ||
             'unknown';
    }
  });

  app.use('/api/', apiLimiter);
}

/**
 * Trust proxy settings for Railway/reverse proxy deployments
 */
export function setupTrustProxy(app) {
  // Trust first proxy (Railway, nginx, etc.)
  app.set('trust proxy', 1);
}
