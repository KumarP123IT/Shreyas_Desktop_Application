/**
 * Express application factory.
 * The entry point (index.js) calls createApp() and starts listening.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config');
const logger = require('./config/logger');
const requestLogger = require('./middleware/requestLogger');
const apiRoutes = require('./routes');
const { errorHandler } = require('./utils/errors');

function createApp() {
  const app = express();

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
    })
  );

  // ── CORS (dev only – in prod the frontend is served from the same origin) ──
  if (config.isDev) {
    app.use(
      cors({
        origin: ['http://localhost:5173', 'http://localhost:4000'],
        credentials: true,
      })
    );
  }

  // ── Body parsers ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // ── Request logging ────────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Rate limiting ──────────────────────────────────────────────────────────
  // IMPORTANT: stricter per-route limiters must be registered BEFORE the
  // global limiter and BEFORE app.use('/api', apiRoutes) so Express reaches
  // them first (middleware is evaluated in registration order).

  // Stricter limit for login – 20 attempts per 15 minutes
  app.use(
    '/api/auth/login',
    rateLimit({
      windowMs: 15 * 60_000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please wait before trying again.' } },
    })
  );

  // Global API limiter – 300 requests per minute
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
    })
  );

  // ── API routes ─────────────────────────────────────────────────────────────
  app.use('/api', apiRoutes);

  // ── Serve built frontend (production / single-command mode) ───────────────
  const frontendDist = config.server.frontendDist;
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    const indexPath = path.join(frontendDist, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Frontend not built yet. Run: npm run build' },
        });
      }
    });
  });

  // ── Central error handler (must be last) ──────────────────────────────────
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
