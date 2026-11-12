/**
 * Custom error classes and the central error handler middleware.
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Parse a string or number as a positive integer.
 * Throws ValidationError with a clean 400 message if the value is not a valid integer.
 * Use this instead of bare parseInt() in route handlers.
 */
function parseId(value, label = 'ID') {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1) {
    throw new ValidationError(`Invalid ${label}: must be a positive integer`);
  }
  return n;
}

/**
 * Express central error handler.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const logger = require('../config/logger');

  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  if (statusCode >= 500) {
    logger.error({ err, path: req.path, method: req.method }, err.message);
  } else {
    logger.warn({ code, path: req.path }, err.message);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: err.isOperational
        ? err.message
        : 'An unexpected error occurred. Please try again.',
      ...(err.details ? { details: err.details } : {}),
    },
  });
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  parseId,
  errorHandler,
};
