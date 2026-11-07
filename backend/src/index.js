/**
 * Smart MSL Monitor – backend entry point.
 * On first run, auto-initialises the database before starting the server.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── First-run detection ────────────────────────────────────────────────────────
// __dirname = backend/src/, so ../storage = backend/storage/
const MARKER = path.resolve(__dirname, '../storage/.firstrun_done');
if (!fs.existsSync(MARKER)) {
  console.log('[bootstrap] First run detected – running setup…');
  try {
    require('../scripts/firstrun.js');
  } catch (err) {
    console.error('[bootstrap] First-run setup failed:', err.message);
    process.exit(1);
  }
}

// ── Load env AFTER firstrun (it writes .env) ─────────────────────────────────
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const config  = require('./config');
const logger  = require('./config/logger');
const prisma  = require('./config/prisma');
const createApp = require('./app');

async function main() {
  // ── Verify DB connection ───────────────────────────────────────────────────
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (err) {
    logger.fatal({ err }, 'Cannot connect to database – aborting startup');
    process.exit(1);
  }

  // ── Ensure storage directories exist ──────────────────────────────────────
  const dirs = [
    path.join(config.storage.root, 'uploads'),
    path.join(config.storage.root, 'uploads', '_temp'),
    path.join(config.storage.root, 'backups'),
    path.join(config.storage.root, 'data'),
  ];
  dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));

  // ── Start Express ──────────────────────────────────────────────────────────
  const app = createApp();
  const server = app.listen(config.server.port, '127.0.0.1', () => {
    logger.info(`Smart MSL Monitor running at http://localhost:${config.server.port}`);
  });

  // ── Start scheduler ────────────────────────────────────────────────────────
  const scheduler = require('./workers/scheduler');
  scheduler.start();

  // ── Start Baileys WhatsApp client ──────────────────────────────────────────
  const baileysService = require('./services/baileysService');
  baileysService.startClient().catch((err) =>
    logger.warn({ err }, 'Baileys: initial connect failed — will retry automatically')
  );

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  async function shutdown(signal) {
    logger.info({ signal }, 'Shutting down…');
    // Stop Baileys first so WA connection closes cleanly
    try { require('./services/baileysService').stopClient(); } catch (_) {}
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Goodbye.');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // Log uncaught errors but only exit on truly fatal ones.
  // Baileys (WhatsApp) is known to emit stray rejections — those must NOT
  // crash the alert service.
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception — continuing');
    // Only exit on unrecoverable system errors
    if (err.code === 'ERR_WORKER_OUT_OF_MEMORY') {
      logger.fatal({ err }, 'Out of memory — exiting');
      process.exit(1);
    }
  });

  process.on('unhandledRejection', (reason) => {
    logger.warn({ reason: String(reason) }, 'Unhandled promise rejection — continuing');
  });
}

main();
