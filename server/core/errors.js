// Custom error class for API errors
export class ApiError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}

// 404 handler
export function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: `Endpoint not found: ${req.method} ${req.path}`
    });
  }
  next();
}

// Global error handler
export function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);

  // Handle known API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }

  // Handle SQLite constraint errors
  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.status(400).json({
      success: false,
      error: 'Database constraint violation'
    });
  }

  // Default server error
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
}
