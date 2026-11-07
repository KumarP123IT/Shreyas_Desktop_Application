/**
 * Database-backed scheduler worker.
 * Polls every 30 s. Claims jobs safely. Survives restarts.
 * On startup: late catch-up for missed reminders.
 */

'use strict';

const cron = require('node-cron');
const prisma = require('../config/prisma');
const notificationService = require('../services/notificationService');
const backupService = require('../services/backupService');
const logger = require('../config/logger');

let _isRunning   = false;
let _lastTick    = null;
let _tickCount   = 0;
let _schedulerStatus = 'stopped';

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
    if (existing && lastKey === breachKey) continue; // breach unchanged

    const settings = await prisma.appSetting.findMany();
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const recipient = delivery.customer?.recipientWhatsapp || settingsMap.recipient_whatsapp;
    if (!recipient) {
      logger.warn({ deliveryId: delivery.id }, 'MSL breach: no WhatsApp recipient configured');
      continue;
    }

    const breachLines = delivery.items.slice(0, 5).map((item) =>
      `• ${item.partName} (${item.partNumber}): ${item.totalQty} [${
        item.mslStatus === 'BELOW_MIN'
          ? `below min ${item.snapshotMinQty}`
          : `above max ${item.snapshotMaxQty}`
      }]`
    ).join('\n');
    const extra = delivery.items.length > 5
      ? `\n(+${delivery.items.length - 5} more – check app)` : '';

    const body = `⚠️ MSL Alert – ${delivery.customer?.name}\nMonth: ${delivery.forecastMonth}\n\n${breachLines}${extra}\n\nOpen Smart MSL Monitor to review.`;

    // Enqueue — only mark as "sent" once it's actually in the outbox
    await notificationService.enqueue({
      channel: 'whatsapp',
      recipient,
      body,
      metadata: { deliveryId: delivery.id, type: 'msl_breach_digest' },
    });

    // Record the fingerprint so we can dedup on the next run.
    // Status is 'pending' until the outbox actually delivers it.
    await prisma.notificationLog.create({
      data: {
        deliveryId: delivery.id,
        channel: 'whatsapp',
        recipient,
        subject: `MSL_BREACH|${breachKey}`,   // fingerprint stored here
        body,
        status: 'pending',                      // not 'sent' — outbox hasn't delivered yet
      },
    });
  }
}

// ── Main tick ─────────────────────────────────────────────────────────────────

async function tick() {
  if (_isRunning) return;
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
    try { await checkMslBreaches(); }
    catch (e) { logger.error({ err: e }, 'MSL breach check error'); }
  });

  // Daily backup at 02:00
  cron.schedule('0 2 * * *', async () => {
    try {
      const result = await backupService.runBackup();
      if (!result.ok) logger.error({ error: result.error }, 'Scheduled backup failed');
    } catch (e) {
      logger.error({ err: e }, 'Scheduled backup error');
    }
  });

  logger.info('Scheduler started (tick 30 s, breach check 5 min, backup 02:00)');
}

function getStatus() {
  return { status: _schedulerStatus, lastTick: _lastTick, isRunning: _isRunning };
}

module.exports = { start, tick, getStatus, catchUpMissed };
