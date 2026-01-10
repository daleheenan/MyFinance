import { verifySession } from './auth.service.js';

/**
 * Middleware to require authentication for protected routes
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Invalid authorization header'
    });
  }

  const { valid, user } = verifySession(token);

  if (!valid) {
    return res.status(401).json({
      success: false,
      error: 'Session expired or invalid'
    });
  }

  // Attach user to request for use in route handlers
  req.user = user;
  req.sessionToken = token;

  next();
}

/**
 * Optional auth - attaches user if token present, but doesn't require it
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { valid, user } = verifySession(token);

    if (valid) {
      req.user = user;
      req.sessionToken = token;
    }
  }

  next();
}

/**
 * Get client IP address from request
 */
export function getClientIP(req) {
  // Check for forwarded IPs (for reverse proxies like Railway)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  // Check for real IP header
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return realIP;
  }

  // Fallback to connection remote address
  return req.socket?.remoteAddress || req.ip || 'unknown';
}
