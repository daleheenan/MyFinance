/**
 * CSRF Protection Middleware
 *
 * Implements double-submit cookie pattern:
 * - CSRF token stored in a readable cookie (csrf_token)
 * - Client must send matching token in X-CSRF-Token header for state-changing requests
 * - Session token stored in HTTP-only cookie (session_token)
 */

import crypto from 'crypto';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const SESSION_COOKIE_NAME = 'session_token';

// Methods that don't require CSRF protection
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Cookie options for production/development
 */
function getCookieOptions(httpOnly = false) {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly,
    secure: isProduction, // HTTPS only in production
    sameSite: 'strict',   // Strict same-site policy
    path: '/',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  };
}

/**
 * Set session cookie (HTTP-only)
 */
export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions(true));
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

/**
 * Set CSRF cookie (readable by JavaScript)
 */
export function setCsrfCookie(res, token) {
  res.cookie(CSRF_COOKIE_NAME, token, getCookieOptions(false));
}

/**
 * Clear CSRF cookie
 */
export function clearCsrfCookie(res) {
  res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
}

/**
 * Get session token from cookie
 */
export function getSessionFromCookie(req) {
  return req.cookies?.[SESSION_COOKIE_NAME] || null;
}

/**
 * CSRF protection middleware
 * - Ensures CSRF token in header matches cookie for unsafe methods
 * - Generates new CSRF token if missing
 */
export function csrfProtection(req, res, next) {
  // Generate CSRF token if not present in cookies
  if (!req.cookies?.[CSRF_COOKIE_NAME]) {
    const csrfToken = generateCsrfToken();
    setCsrfCookie(res, csrfToken);
  }

  // Skip CSRF check for safe methods
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  // For unsafe methods, validate CSRF token
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({
      success: false,
      error: 'CSRF token missing'
    });
  }

  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    return res.status(403).json({
      success: false,
      error: 'CSRF token mismatch'
    });
  }

  next();
}

/**
 * Get CSRF token for response (to send to client if needed)
 */
export function getCsrfToken(req) {
  return req.cookies?.[CSRF_COOKIE_NAME] || null;
}
