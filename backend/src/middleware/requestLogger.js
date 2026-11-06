/**
 * Pino HTTP request logger middleware.
 */

const logger = require('../config/logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level =
      res.statusCode >= 500 ? 'error' :
      res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms,
    });
  });
  next();
}

module.exports = requestLogger;
