/**
 * Notification service – outbox management, retry logic, sending.
 */

const prisma = require('../config/prisma');
const emailService = require('./emailService');
const baileysService = require('./baileysService');
const settingsRepo = require('../repositories/settingsRepository');
const logger = require('../config/logger');
const { differenceInDays } = require('date-fns');

// Exponential backoff delays in minutes: 1, 5, 15, 60, 120, 120…
const BACKOFF_MINUTES = [1, 5, 15, 60, 120];
const MAX_ATTEMPTS = 6; // After this, stop retrying for 24h

/**
 * Enqueue a notification to the outbox.
 */
async function enqueue({ channel, recipient, subject, body, metadata = {} }) {
  return prisma.notificationOutbox.create({
    data: {
      channel,
      recipient,
      subject: subject || null,
      body,
      metadata,
      status: 'pending',
      nextRetryAt: new Date(),
    },
  });
}

/**
 * Send a single outbox item.
 * Returns { success, error }
 */
async function sendOutboxItem(item) {
  try {
    if (item.channel === 'email') {
      await emailService.sendEmail({
        to: item.recipient,
        subject: item.subject || 'MSL Monitor Notification',
        html: item.body,
        text: item.body.replace(/<[^>]+>/g, ''),
      });
    } else if (item.channel === 'whatsapp') {
      const result = await baileysService.sendMessage(item.recipient, item.body);
      // Record WhatsApp message id if available
      if (result?.id) {
        await prisma.notificationOutbox.update({
          where: { id: item.id },
          data: { metadata: { ...(item.metadata || {}), waMessageId: result.id } },
        });
      }
      // Reminder messages invite a numeric reply – open a conversation so the
      // state machine can handle 1/2/3 responses.
      const meta = item.metadata || {};
      if (meta.reminderId && meta.deliveryId) {
        try {
          const { startConversation } = require('./conversationService');
          await startConversation(
            String(item.recipient).replace(/\D/g, ''),
            meta.reminderId,
            meta.deliveryId,
            meta.deliveryItemId || null
          );
        } catch (e) {
          logger.warn({ err: e.message, outboxId: item.id }, 'Failed to open WA conversation');
        }
      }
    } else {
      throw new Error(`Unknown channel: ${item.channel}`);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Process pending outbox items (called by scheduler).
 * Uses status transition as optimistic lock.
 */
async function processOutbox() {
  const now = new Date();

  // Recover items stuck in 'sending' (e.g. after a crash/restart)
  await prisma.notificationOutbox.updateMany({
    where: { status: 'sending', updatedAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } },
    data: { status: 'pending' },
  });

  // Claim items due for sending
  const items = await prisma.notificationOutbox.findMany({
    where: {
      status: 'pending',
      nextRetryAt: { lte: now },
    },
    take: 20,
    orderBy: { nextRetryAt: 'asc' },
  });

  let sent = 0;
  let failed = 0;

  for (const item of items) {
    // Optimistically mark as sending
    const claimed = await prisma.notificationOutbox.updateMany({
      where: { id: item.id, status: 'pending' },
      data: { status: 'sending' },
    });
    if (claimed.count === 0) continue; // Another worker claimed it

    const { success, error } = await sendOutboxItem(item);
    const attemptCount = (item.attemptCount || 0) + 1;

    const meta = item.metadata || {};

    if (success) {
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: { status: 'sent', attemptCount, lastError: null },
      });

      // Update the pre-created log row when present (e.g. MSL breach digest),
      // otherwise write a fresh notification log.
      if (meta.logId) {
        // updateMany (not update) so a cleared/missing log row doesn't throw
        // and wedge the rest of the outbox batch in 'sending'.
        await prisma.notificationLog.updateMany({
          where: { id: meta.logId },
          data: {
            status: 'sent',
            errorDetail: null,
            whatsappMsgId: meta.waMessageId || null,
            sentAt: new Date(),
          },
        });
      } else if (meta.deliveryId) {
        await prisma.notificationLog.create({
          data: {
            deliveryId: meta.deliveryId,
            channel: item.channel,
            recipient: item.recipient,
            subject: item.subject,
            body: item.body,
            status: 'sent',
            whatsappMsgId: meta.waMessageId || null,
          },
        });
      }
      sent++;
    } else {
      const nextDelay = BACKOFF_MINUTES[Math.min(attemptCount, BACKOFF_MINUTES.length - 1)];
      const nextRetryAt = new Date(now.getTime() + nextDelay * 60 * 1000);
      const newStatus = attemptCount >= MAX_ATTEMPTS ? 'failed' : 'pending';

      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: {
          status: newStatus,
          attemptCount,
          lastError: error,
          nextRetryAt: newStatus === 'pending' ? nextRetryAt : null,
        },
      });

      if (meta?.logId) {
        // Update the pre-created log row. While the outbox still has retries
        // left the row stays 'pending'; only a terminal failure marks it failed.
        await prisma.notificationLog.updateMany({
          where: { id: meta.logId },
          data: {
            status: newStatus === 'failed' ? 'failed' : 'pending',
            errorDetail: error,
          },
        });
      } else if (meta?.deliveryId) {
        await prisma.notificationLog.create({
          data: {
            deliveryId: meta.deliveryId,
            channel: item.channel,
            recipient: item.recipient,
            subject: item.subject,
            body: item.body,
            status: 'failed',
            errorDetail: error,
          },
        });
      }
      failed++;
      logger.warn({ outboxId: item.id, error, attempt: attemptCount }, 'Notification send failed');
    }
  }

  return { sent, failed };
}

/**
 * Build and enqueue a reminder notification.
 */
async function enqueueReminder(reminder) {
  const delivery = await prisma.delivery.findUnique({
    where: { id: reminder.deliveryId },
    include: {
      customer: true,
      items: { where: { deletedAt: null }, orderBy: { rowOrder: 'asc' } },
    },
  });
  if (!delivery) {
    logger.warn({ reminderId: reminder.id }, 'Reminder references missing delivery – skipping');
    return null;
  }

  const settings = await settingsRepo.getAllDecrypted();
  const recipient =
    reminder.channel === 'whatsapp'
      ? (delivery.customer?.recipientWhatsapp || settings.recipient_whatsapp)
      : (delivery.customer?.recipientEmail || settings.recipient_email);

  if (!recipient) {
    logger.warn({ reminderId: reminder.id, channel: reminder.channel }, 'No recipient configured – skipping');
    return null;  // caller checks for null to surface visible failure
  }

  const daysLeft = delivery.dueDate
    ? differenceInDays(new Date(delivery.dueDate), new Date())
    : null;

  // Get template
  const { render, buildReminderTokens } = require('../utils/templateRenderer');

  let body;
  if (reminder.channel === 'whatsapp') {
    const tpl = settings.tpl_whatsapp_reminder || '{{customerName}} – delivery due {{dueDate}} ({{daysLeft}} days left)';
    const appName = settings.app_name || 'Smart MSL Monitor';
    // Build digest of all breach items
    const breaches = delivery.items
      .filter((i) => i.mslStatus !== 'NORMAL' && i.mslStatus !== 'NOT_CONFIGURED')
      .sort((a, b) => (a.mslStatus === 'BELOW_MIN' ? 0 : 1) - (b.mslStatus === 'BELOW_MIN' ? 0 : 1))
      .slice(0, 5);

    if (breaches.length > 0) {
      const breachLines = breaches.map((item) => {
        return `• ${item.partName} (${item.partNumber}) | Qty: ${item.totalQty} | Min: ${item.snapshotMinQty} | Max: ${item.snapshotMaxQty} → ${item.mslStatus}`;
      }).join('\n');

      const totalBreaches = delivery.items.filter(i => i.mslStatus !== 'NORMAL' && i.mslStatus !== 'NOT_CONFIGURED').length;
      body = `${appName} – Delivery Reminder\n\nCustomer: ${delivery.customer?.name}\nForecast: ${delivery.forecastMonth}\nDue: ${daysLeft !== null ? daysLeft + ' days away' : '—'}\n\n⚠️ Parts needing attention:\n${breachLines}${totalBreaches > breaches.length ? `\n(+${totalBreaches - breaches.length} more – check the app)` : ''}\n\nReply with a number:\n1 – Remind me later\n2 – Remind me at a specific date & time\n3 – Delivered – stop messages`;
    } else {
      body = render(tpl, buildReminderTokens({ delivery, item: delivery.items[0], daysLeft }));
      body += '\n\nReply with a number:\n1 – Remind me later\n2 – Remind me at a specific date & time\n3 – Delivered – stop messages';
    }
  } else {
    const subjectTpl = settings.tpl_email_reminder_subject || 'Delivery Reminder: {{customerName}} – due {{dueDate}}';
    const bodyTpl = settings.tpl_email_reminder_body || '<p>Delivery reminder for {{customerName}}. Due: {{dueDate}}</p>';
    const tokens = buildReminderTokens({ delivery, item: delivery.items[0], daysLeft });
    body = render(bodyTpl, tokens);
  }

  return await enqueue({
    channel: reminder.channel,
    recipient,
    subject: reminder.channel === 'email'
      ? render(settings.tpl_email_reminder_subject || 'Delivery Reminder: {{customerName}}',
          buildReminderTokens({ delivery, item: delivery.items[0], daysLeft }))
      : null,
    body,
    metadata: {
      deliveryId: delivery.id,
      reminderId: reminder.id,
      deliveryItemId: reminder.deliveryItemId || null,
      customerId: delivery.customerId,
    },
  });
}

// ── Outbox cleanup ────────────────────────────────────────────────────────────

async function cleanupOutbox() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.notificationOutbox.deleteMany({
    where: {
      status: { in: ['sent', 'failed'] },
      updatedAt: { lt: cutoff },
    },
  });
  if (result.count > 0) {
    logger.info({ deleted: result.count }, 'Outbox cleanup: removed old sent/failed items');
  }
  return result.count;
}

/**
 * Re-queue a notification from the log (the "Retry" button on the
 * Notifications page). `id` is a NotificationLog id. A fresh outbox item
 * is created that points back at the log row, so processOutbox() updates
 * the same row to sent/failed.
 */
async function retryNotification(id) {
  const { NotFoundError } = require('../utils/errors');
  const log = await prisma.notificationLog.findUnique({ where: { id } });
  if (!log) throw new NotFoundError('Notification');

  await prisma.notificationOutbox.create({
    data: {
      channel:     log.channel,
      recipient:   log.recipient,
      subject:     log.subject || null,
      body:        log.body,
      metadata:    JSON.stringify({ deliveryId: log.deliveryId, logId: log.id, retry: true }),
      status:      'pending',
      nextRetryAt: new Date(),
    },
  });

  await prisma.notificationLog.update({
    where: { id: log.id },
    data:  { status: 'pending', errorDetail: null },
  });
}

function buildLogWhere({ channel, customerId, status, from, to } = {}) {
  return {
    ...(channel ? { channel } : {}),
    ...(status ? { status } : {}),
    ...(customerId ? { delivery: { customerId: parseInt(customerId) } } : {}),
    ...(from || to ? {
      sentAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(to) }   : {}),
      },
    } : {}),
  };
}

/**
 * List notification logs with filters.
 */
async function listLogs({ channel, customerId, status, from, to, page = 1, pageSize = 50 }) {
  const where = buildLogWhere({ channel, customerId, status, from, to });

  const [data, total] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { delivery: { select: { forecastMonth: true, customer: { select: { name: true } } } } },
    }),
    prisma.notificationLog.count({ where }),
  ]);
  return { data, total };
}

/**
 * Permanently delete notification log records matching the filters.
 * Pass no filters to clear the entire log.
 */
async function clearLogs(filters = {}, userId = null) {
  const where = buildLogWhere(filters);
  const result = await prisma.notificationLog.deleteMany({ where });

  if (userId) {
    await prisma.auditLog.create({
      data: {
        userId,
        entityType: 'notification_log',
        action: 'CLEAR_LOGS',
        after: { deleted: result.count, filters },
      },
    });
  }

  logger.info({ deleted: result.count, userId }, 'Notification logs cleared');
  return { deleted: result.count };
}

/**
 * Check internet connectivity (cached per minute).
 */
let _lastInternetCheck = 0;
let _lastInternetResult = true;

async function checkInternet() {
  const now = Date.now();
  if (now - _lastInternetCheck < 60_000) return _lastInternetResult;
  try {
    const { default: axiosLib } = await import('axios');
    await axiosLib.get('https://dns.google', { timeout: 3000 });
    _lastInternetResult = true;
  } catch {
    _lastInternetResult = false;
  }
  _lastInternetCheck = now;
  return _lastInternetResult;
}

module.exports = {
  enqueue, enqueueReminder, processOutbox, cleanupOutbox,
  retryNotification, listLogs, clearLogs, checkInternet,
};
