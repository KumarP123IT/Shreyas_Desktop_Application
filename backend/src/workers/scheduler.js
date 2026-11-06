/**
 * Database-backed scheduler worker.
 * Polls every 30 s. Claims jobs safely. Survives restarts.
 * On startup: late catch-up for missed reminders.
 */

const cron = require('node-cron');
const prisma = require('../config/prisma');
const notificationService = require('../services/notificationService');
const reminderService = require('../services/reminderService');
const backupService = require('../services/backupService');
const logger = require('../config/logger');

let _isRunning = false;
let _lastTick = null;
let _schedulerStatus = 'stopped';

/**
 * Process due ScheduledReminders.
 */
async function processDueReminders() {
  const now = new Date();

  // Recover reminders stuck in 'sending' after a crash/restart
  await prisma.scheduledReminder.updateMany({
    where: { status: 'sending', updatedAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } },
    data: { status: 'pending' },
  });

  // Claim pending reminders due now
  const due = await prisma.scheduledReminder.findMany({
    where: { status: 'pending', runAt: { lte: now } },
    take: 20,
    orderBy: { runAt: 'asc' },
  });

  let processed = 0;
  const online = await notificationService.checkInternet();

  for (const reminder of due) {
    // Optimistic lock via status transition
    const claimed = await prisma.scheduledReminder.updateMany({
      where: { id: reminder.id, status: 'pending' },
      data: { status: 'sending' },
    });
    if (claimed.count === 0) continue;

    // Check delivery is still active
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

    if (!online) {
      // Queue in outbox for retry when online
      await notificationService.enqueueReminder(reminder);
      await prisma.scheduledReminder.update({
        where: { id: reminder.id },
        data: { status: 'sent', lastAttemptAt: now },
      });
      logger.info({ reminderId: reminder.id }, 'Reminder queued (offline)');
    } else {
      // Enqueue to outbox and immediately process
      await notificationService.enqueueReminder(reminder);
      await notificationService.processOutbox();
      await prisma.scheduledReminder.update({
        where: { id: reminder.id },
        data: { status: 'sent', lastAttemptAt: now, attemptCount: 1 },
      });
    }
    processed++;
  }

  if (processed > 0) logger.info({ processed }, 'Scheduler: reminders processed');
  return processed;
}

/**
 * Late catch-up on startup: missed reminders that are still relevant.
 */
async function catchUpMissed() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // up to 24h back

  const missed = await prisma.scheduledReminder.findMany({
    where: {
      status: 'pending',
      runAt: { lt: now, gte: cutoff },
    },
    include: {
      delivery: { select: { status: true, dueDate: true, deletedAt: true } },
    },
  });

  let caught = 0;
  for (const reminder of missed) {
    // Only send if delivery is still active and due date hasn't passed
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

    await notificationService.enqueueReminder(reminder);
    await prisma.scheduledReminder.update({
      where: { id: reminder.id },
      data: { status: 'sent', lastAttemptAt: now, lastError: 'Late send – PC was off' },
    });
    caught++;
  }

  if (caught > 0) logger.info({ caught }, 'Scheduler: late catch-up sent');
}

/**
 * Check MSL breaches on active deliveries.
 * Sends ONE digest per delivery. Dedupes by (item, status, ruleVersion).
 */
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

    // Check if we already sent an alert for this exact breach combination
    const breachKey = delivery.items.map((i) => `${i.id}:${i.mslStatus}`).sort().join('|');
    const existing = await prisma.notificationLog.findFirst({
      where: {
        deliveryId: delivery.id,
        subject: { contains: 'MSL_BREACH_DIGEST' },
        status: 'sent',
      },
      orderBy: { sentAt: 'desc' },
    });

    // Check if breach fingerprint has changed since last alert
    const lastKey = existing?.errorDetail || ''; // we abuse errorDetail to store fingerprint
    if (existing && lastKey === breachKey) continue; // no change

    const settings = await prisma.appSetting.findMany();
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const recipient = delivery.customer?.recipientWhatsapp || settingsMap.recipient_whatsapp;
    if (!recipient) continue;

    const breachLines = delivery.items.slice(0, 5).map((item) =>
      `• ${item.partName} (${item.partNumber}): ${item.totalQty} [${item.mslStatus === 'BELOW_MIN' ? `below min ${item.snapshotMinQty}` : `above max ${item.snapshotMaxQty}`}]`
    ).join('\n');

    const extra = delivery.items.length > 5 ? `\n(+${delivery.items.length - 5} more – check app)` : '';

    const body = `⚠️ MSL Alert – ${delivery.customer?.name}\nMonth: ${delivery.forecastMonth}\n\n${breachLines}${extra}\n\nOpen Smart MSL Monitor to review.`;

    await notificationService.enqueue({
      channel: 'whatsapp',
      recipient,
      body,
      metadata: { deliveryId: delivery.id, type: 'msl_breach_digest' },
    });

    // Log the breach (storing fingerprint in errorDetail for dedup)
    await prisma.notificationLog.create({
      data: {
        deliveryId: delivery.id,
        channel: 'whatsapp',
        recipient,
        subject: 'MSL_BREACH_DIGEST',
        body,
        status: 'sent',
        errorDetail: breachKey,
      },
    });
  }
}

/**
 * Main scheduler tick.
 */
async function tick() {
  if (_isRunning) return; // Prevent overlapping ticks
  _isRunning = true;
  _lastTick = new Date();

  try {
    await processDueReminders();
    await notificationService.processOutbox();
    // Check breaches every 5 ticks (approx 2.5 min)
    if (Math.floor(_lastTick.getTime() / 1000) % 150 < 30) {
      await checkMslBreaches();
    }
  } catch (e) {
    logger.error({ err: e }, 'Scheduler tick error');
  } finally {
    _isRunning = false;
  }
}

/**
 * Start the scheduler.
 */
function start() {
  logger.info('Scheduler starting…');
  _schedulerStatus = 'running';

  // Catch-up on startup (non-blocking)
  catchUpMissed().catch((e) => logger.error({ err: e }, 'Catch-up error'));

  // Main cron: every 30 seconds
  cron.schedule('*/30 * * * * *', tick);

  // Daily database backup at 02:00 (keeps last 14, logs to BackupLog)
  cron.schedule('0 2 * * *', async () => {
    try {
      const result = await backupService.runBackup();
      if (!result.ok) logger.error({ error: result.error }, 'Scheduled backup failed');
    } catch (e) {
      logger.error({ err: e }, 'Scheduled backup error');
    }
  });

  logger.info('Scheduler started (every 30 s, daily backup at 02:00)');
}

function getStatus() {
  return {
    status: _schedulerStatus,
    lastTick: _lastTick,
    isRunning: _isRunning,
  };
}

module.exports = { start, tick, getStatus, catchUpMissed };
