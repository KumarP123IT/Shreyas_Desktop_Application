/**
 * Central configuration – reads process.env and validates required values.
 * Import this module everywhere instead of reading process.env directly.
 *
 * NOTE: dotenv is loaded by index.js BEFORE this module is first required.
 * The bare dotenv.config() call here is intentionally a no-op in that path
 * (dotenv skips already-set vars), but provides a fallback for direct
 * invocations (tests, scripts) where index.js hasn't run first.
 */

const path   = require('path');
const dotenv = require('dotenv');

// Fallback dotenv load: try cwd/.env first, then __dirname/../../../.env
// (covers both service runtime and direct script invocations)
if (!process.env.JWT_SECRET) {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),   // $INSTDIR/src/config → $INSTDIR/.env
    path.resolve(__dirname, '../../../.env'), // dev: backend/src/config → backend/.env
  ];
  for (const p of candidates) {
    const result = dotenv.config({ path: p });
    if (!result.error && process.env.JWT_SECRET) break;
  }
}

function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

const isProd = (process.env.NODE_ENV || 'development') === 'production';

// In production, secrets MUST be set to real values — fail loudly rather
// than run insecurely. Presence alone isn't enough: the dev placeholders
// from .env.example must also be rejected.
if (isProd) {
  const PLACEHOLDERS = new Set([
    'dev-secret-change-me',
    'change-me',
    'change-me-to-a-long-random-string',
    // exact strings from .env.example:
    'change-me-to-a-long-random-string-at-least-64-chars',
    'change-me-to-a-unique-random-string',
    '00000000000000000000000000000000',
  ]);
  ['JWT_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL'].forEach((k) => {
    const v = process.env[k];
    if (!v || PLACEHOLDERS.has(v)) {
      console.error(`[config] FATAL: ${k} is missing or still set to a placeholder value`);
      process.exit(1);
    }
  });
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isDev: !isProd,

  server: {
    port: parseInt(process.env.PORT || '4000', 10),
    // __dirname = $INSTDIR/src/config  →  ../../ = $INSTDIR (install root)
    // FRONTEND_DIST is relative to install root, e.g. "frontend/dist"
    frontendDist: path.resolve(
      __dirname,
      '../../',
      process.env.FRONTEND_DIST || 'frontend/dist'
    ),
  },

  db: {
    url: process.env.DATABASE_URL || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    rememberExpiresIn: process.env.JWT_REMEMBER_EXPIRES_IN || '30d',
    cookieName: 'msl_token',
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY || '00000000000000000000000000000000',
  },

  storage: {
    // __dirname = $INSTDIR/src/config → ../../ = $INSTDIR
    // STORAGE_ROOT in .env is an absolute path written by firstrun.js
    root: process.env.STORAGE_ROOT
      ? path.resolve(process.env.STORAGE_ROOT)
      : path.resolve(__dirname, '../../storage'),
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR
      ? path.resolve(process.env.LOG_DIR)
      : path.resolve(__dirname, '../../logs'),
  },

  scheduler: {
    intervalSec: parseInt(process.env.SCHEDULER_INTERVAL_SEC || '30', 10),
  },

  // Timezone used for scheduler cron expressions and reminder time calculations.
  // Reads from APP_TIMEZONE env var first, falls back to 'Asia/Kolkata'.
  // This should match the 'timezone' key in AppSetting for consistency.
  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
};

module.exports = config;
