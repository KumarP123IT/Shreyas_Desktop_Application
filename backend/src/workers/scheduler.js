/**
 * Database-backed scheduler worker.
 * Polls every 30 s. Claims jobs safely. Survives restarts.
 * On startup: late catch-up for missed reminders.
 */

'use strict';

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const prisma = require('../config/prisma');
const notificationService = require('../services/notificationService');
const backupService = require('../services/backupService');
const config = require('../config');
const logger = require('../config/logger');

let _isRunning   = false;
let _paused      = false;   // set during DB restore so ticks don't hit a swapped file
let _lastTick    = null;
let _tickCount   = 0;
let _schedulerStatus = 'stopped';

// ── Temp upload cleanup ───────────────────────────────────────────────────────

async function cleanupTempUploads() {
  const tempDir = path.join(config.storage.root, 'uploads', '_temp');
  if (!fs.existsSync(tempDir)) return;

  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2 hours
  let removed = 0;
  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          removed++;
        }
      } catch (e) {
        logger.warn({ err: e.message, filePath }, 'Could not remove temp upload file');
      }
    }
  } catch (e) {
    logger.warn({ err: e.message }, 'Could not scan temp upload directory');
  }
  if (removed > 0) logger.info({ removed }, 'Temp upload cleanup: removed stale files');
}

// ── Reminder processing ───────────────────────────────────────────────────────

async function processDueReminders() {
  const now = new Date();

  // Recover reminders stuck in 'sending' after a crash/restart
  await prisma.scheduledReminder.updateMany({
    where: { status: 'sending', updatedAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } },
    data: { status: 'pending' },
  });

  const due = await prisma.scheduledReminder.findMany({
    where: { status: 'pending', runAt: { lte: now } },
    take: 20,
    orderBy: { runAt: 'asc' },
  });

  let processed = 0;

  for (const reminder of due) {
    // Optimistic lock
    const claimed = await prisma.scheduledReminder.updateMany({
      where: { id: reminder.id, status: 'pending' },
      data: { status: 'sending' },
    });
    if (claimed.count === 0) continue;

    // Delivery must still be active
    const delivery = await prisma.delivery.findFirst({
      where: { id: reminder.deliveryId, status: 'active', deletedAt: null },
    });

    if (!delivery) {
      await prisma.scheduledReminder.update({
        where: { id: reminder.id },
        data: { status: 'stopped', lastError: 'Delivery no longer active' },
      });
      continue;
    }

    // Enqueue — enqueueReminder returns null if no recipient is configured
    let enqueued = false;
    try {
      const outboxItem = await notificationService.enqueueReminder(reminder);
      enqueued = !!outboxItem;
    } catch (e) {
      logger.error({ err: e, reminderId: reminder.id }, 'enqueueReminder threw');
    }

    if (!enqueued) {
      // No recipient configured — surface as a visible failure, not silent skip
      await prisma.scheduledReminder.update({
        where: { id: reminder.id },
        data: {
          status: 'failed',
          lastError: 'No recipient configured for this channel',
          lastAttemptAt: now,
        },
      });
      logger.warn({ reminderId: reminder.id, channel: reminder.channel },
        'Reminder failed: no recipient configured');
      continue;
    }

    // Mark the scheduled reminder as sent — actual delivery is tracked by outbox
    await prisma.scheduledReminder.update({
      where: { id: reminder.id },
      data: { status: 'sent', lastAttemptAt: now, attemptCount: 1 },
    });
    processed++;
  }

  if (processed > 0) logger.info({ processed }, 'Scheduler: reminders processed');
  return processed;
}

// ── Late catch-up ─────────────────────────────────────────────────────────────

async function catchUpMissed() {
  const now    = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const missed = await prisma.scheduledReminder.findMany({
    where: { status: 'pending', runAt: { lt: now, gte: cutoff } },
    include: { delivery: { select: { status: true, dueDate: true, deletedAt: true } } },
  });

  let caught = 0;
  for (const reminder of missed) {
    if (
      !reminder.delivery ||
      reminder.delivery.status !== 'active' ||
      reminder.delivery.deletedAt ||
      (reminder.delivery.dueDate && new Date(reminder.delivery.dueDate) < now)
    ) {
      await prisma.scheduledReminder.update({
        where: { id: reminder.id },
        data: { status: 'stopped', lastError: 'Missed and no longer relevant' },
      });
      continue;
    }

    const outboxItem = await notificationService.enqueueReminder(reminder);
    if (!outboxItem) {
      await prisma.scheduledReminder.update({
        where: { id: reminder.id },
        data: { status: 'failed', lastError: 'No recipient configured', lastAttemptAt: now },
      });
      continue;
    }

    await prisma.scheduledReminder.update({
      where: { id: reminder.id },
      data: { status: 'sent', lastAttemptAt: now, lastError: 'Late send – PC was off' },
    });
    caught++;
  }

  if (caught > 0) logger.info({ caught }, 'Scheduler: late catch-up sent');
}

// ── MSL breach alerts ─────────────────────────────────────────────────────────
// Runs on its own cron (every 5 minutes) instead of modulo tick count,
// which could be skipped if the process restarts mid-cycle.

async function checkMslBreaches() {
  const deliveries = await prisma.delivery.findMany({
    where: { status: 'active', deletedAt: null, dueDate: { gte: new Date() } },
    include: {
      customer: true,
      items: { where: { deletedAt: null, mslStatus: { in: ['BELOW_MIN', 'ABOVE_MAX'] } } },
    },
  });

  // Read settings ONCE before the loop — not per delivery
  const settings = await prisma.appSetting.findMany();
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  for (const delivery of deliveries) {
    if (delivery.items.length === 0) continue;

    // Build a deterministic fingerprint of the current breach set
    const breachKey = delivery.items
      .map((i) => `${i.id}:${i.mslStatus}`)
      .sort()
      .join('|');

    // Dedup: look for the most recent breach log for this delivery.
    // Store fingerprint in `subject` using a well-known prefix so it's
    // not confused with errorDetail (which is for real error messages).
    const existing = await prisma.notificationLog.findFirst({
      where: { deliveryId: delivery.id, subject: { startsWith: 'MSL_BREACH|' } },
      orderBy: { sentAt: 'desc' },
    });

    const lastKey = existing?.subject?.replace('MSL_BREACH|', '') ?? '';
    // Same fingerprint → skip, unless the last attempt failed (then re-alert)
    if (existing && lastKey === breachKey && existing.status !== 'failed') continue;

    // Send to both configured channels (WhatsApp and/or email)
    const waRecipient = delivery.customer?.recipientWhatsapp || settingsMap.recipient_whatsapp;
    const emailRecipient = delivery.customer?.recipientEmail || settingsMap.recipient_email;

    if (!waRecipient && !emailRecipient) {
      logger.warn({ deliveryId: delivery.id }, 'MSL breach: no recipient configured for any channel');
      continue;
    }

    // Below-minimum parts first, then above-maximum — grouped in the message
    const belowItems = delivery.items.filter((i) => i.mslStatus === 'BELOW_MIN');
    const aboveItems = delivery.items.filter((i) => i.mslStatus === 'ABOVE_MAX');

    const fmt = (item) =>
      `• ${item.partName} (${item.partNumber}): ${item.totalQty} [${
        item.mslStatus === 'BELOW_MIN'
          ? `below min ${item.snapshotMinQty}`
          : `above max ${item.snapshotMaxQty}`
      }]`;

    const sections = [];
    if (belowItems.length) {
      sections.push(`Below minimum:\n${belowItems.slice(0, 5).map(fmt).join('\n')}` +
        (belowItems.length > 5 ? `\n(+${belowItems.length - 5} more)` : ''));
    }
    if (aboveItems.length) {
      sections.push(`Above maximum:\n${aboveItems.slice(0, 5).map(fmt).join('\n')}` +
        (aboveItems.length > 5 ? `\n(+${aboveItems.length - 5} more)` : ''));
    }
    const breachLines = sections.join('\n\n');

    const customerName = delivery.customer?.name ?? 'Unknown customer';
    const appName = settingsMap.app_name || 'Smart MSL Monitor';

    const waBody = `⚠️ MSL Alert – ${customerName}\nMonth: ${delivery.forecastMonth}\n\n${breachLines}\n\nOpen ${appName} to review.`;
    const emailSubject = `MSL Alert – ${customerName} (${delivery.forecastMonth})`;
    const emailBody = `<p>⚠️ <strong>MSL Breach Detected</strong></p><p>Customer: ${customerName}<br/>Month: ${delivery.forecastMonth}</p><pre>${breachLines}</pre><p>Open ${appName} to review.</p>`;

    // Create the log row FIRST (fingerprinted subject for dedup)
    const logRow = await prisma.notificationLog.create({
      data: {
        deliveryId: delivery.id,
        channel: waRecipient ? 'whatsapp' : 'email',
        recipient: waRecipient || emailRecipient,
        subject: `MSL_BREACH|${breachKey}`,   // fingerprint stored here
        body: waRecipient ? waBody : emailBody,
        status: 'pending',
      },
    });

    if (waRecipient) {
      await notificationService.enqueue({
        channel: 'whatsapp',
        recipient: waRecipient,
        body: waBody,
        metadata: { deliveryId: delivery.id, type: 'msl_breach_digest', logId: logRow.id },
      });
    }

    if (emailRecipient) {
      await notificationService.enqueue({
        channel: 'email',
        recipient: emailRecipient,
        subject: emailSubject,
        body: emailBody,
        metadata: { deliveryId: delivery.id, type: 'msl_breach_digest', logId: waRecipient ? null : logRow.id },
      });
    }
  }
}

// ── Main tick ─────────────────────────────────────────────────────────────────

async function tick() {
  if (_isRunning || _paused) return;
  _isRunning = true;
  _lastTick  = new Date();
  _tickCount++;

  try {
    await processDueReminders();
    await notificationService.processOutbox();
  } catch (e) {
    logger.error({ err: e }, 'Scheduler tick error');
  } finally {
    _isRunning = false;
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

function start() {
  logger.info('Scheduler starting…');
  _schedulerStatus = 'running';

  catchUpMissed().catch((e) => logger.error({ err: e }, 'Catch-up error'));

  // Main tick — every 30 seconds
  cron.schedule('*/30 * * * * *', tick);

  // MSL breach check — every 5 minutes (separate cron, not modulo)
  cron.schedule('*/5 * * * *', async () => {
    if (_paused) return;
    try { await checkMslBreaches(); }
    catch (e) { logger.error({ err: e }, 'MSL breach check error'); }
  });

  // Daily backup at 02:00 in the configured timezone
  cron.schedule('0 2 * * *', async () => {
    if (_paused) return;
    try {
      const result = await backupService.runBackup();
      if (!result.ok) logger.error({ error: result.error }, 'Scheduled backup failed');
    } catch (e) {
      logger.error({ err: e }, 'Scheduled backup error');
    }
  }, { timezone: config.timezone });

  // Weekly outbox cleanup — every Sunday at 03:00 (removes sent/failed items older than 30 days)
  cron.schedule('0 3 * * 0', async () => {
    if (_paused) return;
    try { await notificationService.cleanupOutbox(); }
    catch (e) { logger.error({ err: e }, 'Outbox cleanup error'); }
  }, { timezone: config.timezone });

  // Hourly temp-upload cleanup — remove orphaned uploads older than 2 hours
  cron.schedule('0 * * * *', async () => {
    if (_paused) return;
    try { await cleanupTempUploads(); }
    catch (e) { logger.error({ err: e }, 'Temp upload cleanup error'); }
  });

  logger.info('Scheduler started (tick 30 s, breach check 5 min, backup 02:00, cleanup Sun 03:00)');
}

function pause()  { _paused = true;  logger.warn('Scheduler paused (DB restore in progress)'); }
function resume() { _paused = false; logger.info('Scheduler resumed'); }

function getStatus() {
  return { status: _schedulerStatus, lastTick: _lastTick, isRunning: _isRunning, paused: _paused };
}

module.exports = { start, tick, getStatus, catchUpMissed, pause, resume };
