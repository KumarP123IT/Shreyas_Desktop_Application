/**
 * GET /api/health – system health check.
 * Checks: DB, scheduler heartbeat, WAHA session, SMTP, internet,
 * outbox queue size, and last backup status.
 */

const { Router } = require('express');
const prisma = require('../config/prisma');
const settingsRepo = require('../repositories/settingsRepository');
const logger = require('../config/logger');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

async function checkDb() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

async function checkInternet() {
  try {
    const { default: axios } = await import('axios');
    await axios.get('https://dns.google', { timeout: 3000 });
    return { status: 'ok' };
  } catch {
    return { status: 'offline' };
  }
}

async function checkWaha() {
  try {
    const s = await settingsRepo.getAllDecrypted();
    if (!s.waha_url) return { status: 'not_configured' };
    const { default: axios } = await import('axios');
    const res = await axios.get(`${s.waha_url}/api/sessions/${s.waha_session || 'default'}`, {
      headers: s.waha_api_key ? { 'X-Api-Key': s.waha_api_key } : {},
      timeout: 4000,
    });
    return { status: res.data?.status === 'WORKING' ? 'ok' : (res.data?.status || 'unknown') };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

async function checkSmtp() {
  try {
    const s = await settingsRepo.getAllDecrypted();
    if (!s.smtp_host) return { status: 'not_configured' };
    const emailService = require('../services/emailService');
    // Bound the verify call so a dead SMTP host can't stall the health check.
    const result = await Promise.race([
      emailService.verifySmtp(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('SMTP verify timed out')), 5000)),
    ]);
    return result.ok ? { status: 'ok' } : { status: 'error', message: result.error };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

async function getOutboxQueue() {
  try {
    const [pending, failed] = await Promise.all([
      prisma.notificationOutbox.count({ where: { status: 'pending' } }),
      prisma.notificationOutbox.count({ where: { status: 'failed' } }),
    ]);
    return { pending, failed };
  } catch {
    return { pending: null, failed: null };
  }
}

async function getLastBackup() {
  try {
    const last = await prisma.backupLog.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!last) return { status: 'never_run' };
    return {
      status: last.status,
      filePath: last.filePath,
      sizeBytes: last.sizeBytes ? Number(last.sizeBytes) : null,
      error: last.error || null,
      at: last.createdAt,
    };
  } catch {
    return { status: 'unknown' };
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const scheduler = require('../workers/scheduler');
    const [db, internet, waha, smtp, outbox, backup] = await Promise.allSettled([
      checkDb(),
      checkInternet(),
      checkWaha(),
      checkSmtp(),
      getOutboxQueue(),
      getLastBackup(),
    ]);

    const schedStatus = scheduler.getStatus();
    const val = (r, fallback) => (r.status === 'fulfilled' ? r.value : fallback);

    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        db:        val(db,       { status: 'error' }),
        internet:  val(internet, { status: 'error' }),
        scheduler: {
          status:    schedStatus.status,
          lastTick:  schedStatus.lastTick,
          isRunning: schedStatus.isRunning,
        },
        waha:  val(waha,  { status: 'error' }),
        smtp:  val(smtp,  { status: 'error' }),
        backup: val(backup, { status: 'unknown' }),
      },
      outbox: val(outbox, { pending: null, failed: null }),
    };

    const degraded =
      health.services.db.status !== 'ok' ||
      health.services.backup.status === 'failed' ||
      health.services.scheduler.status !== 'running';
    if (degraded) health.status = 'degraded';

    res.json(health);
  })
);

module.exports = router;
