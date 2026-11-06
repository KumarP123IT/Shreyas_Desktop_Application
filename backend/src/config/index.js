/**
 * Central configuration – reads process.env and validates required values.
 * Import this module everywhere instead of reading process.env directly.
 */

require('dotenv').config();
const path = require('path');

function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  server: {
    port: parseInt(process.env.PORT || '4000', 10),
    frontendDist: path.resolve(
      __dirname,
      '../../',
      process.env.FRONTEND_DIST || '../frontend/dist'
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
    root: path.resolve(
      __dirname,
      '../../',
      process.env.STORAGE_ROOT || './storage'
    ),
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
    dir: path.resolve(
      __dirname,
      '../../',
      process.env.LOG_DIR || './logs'
    ),
  },

  scheduler: {
    intervalSec: parseInt(process.env.SCHEDULER_INTERVAL_SEC || '30', 10),
  },

  timezone: 'Asia/Kolkata',
};

module.exports = config;
