/**
 * Reminder service – generates, manages, snoozes and stops ScheduledReminders.
 * All times stored as UTC; Asia/Kolkata used for display only.
 */

const prisma = require('../config/prisma');
const settingsRepo = require('../repositories/settingsRepository');
const config = require('../config');
const { toZonedTime, fromZonedTime } = require('date-fns-tz');
const { addDays, subDays, isAfter, isBefore, parseISO, startOfDay } = require('date-fns');
const logger = require('../config/logger');
const { NotFoundError, ValidationError } = require('../utils/errors');

// Timezone for reminder scheduling — reads from config (which reads APP_TIMEZONE env or falls back to
// the DB setting default 'Asia/Kolkata'). This is the single source of truth.
const TZ = config.timezone;
const DEFAULT_OFFSETS = [10, 5, 3, 1];

/**
 * Generate ScheduledReminders for a delivery.
 * Idempotent – uses unique dedupeKey so re-running is safe.
 * Rules: never in the past, never outside start→due window.
 */
async function generateReminders(deliveryId, userId = null) {
  const delivery = await prisma.delivery.findFirst({
    where: { id: deliveryId, deletedAt: null },
    include: { customer: true },
  });
  if (!delivery) throw new NotFoundError('Delivery');
  if (!delivery.dueDate) {
    logger.info({ deliveryId }, 'No due date set – skipping reminder generation');
    return { created: 0, skipped: 0 };
  }

  // Global defaults from Settings → Reminder Defaults
  const s = await settingsRepo.getAllDecrypted();

  let offsets = delivery.reminderOffsets || delivery.customer?.reminderOffsets;
  // reminderOffsets is stored as a JSON string on the model — parse it
  if (typeof offsets === 'string') {
    try { offsets = JSON.parse(offsets); } catch { offsets = null; }
  }
  if (!offsets) {
    try { offsets = s.default_reminder_offsets ? JSON.parse(s.default_reminder_offsets) : null; } catch { offsets = null; }
  }
  offsets = offsets || DEFAULT_OFFSETS;

  // Send time-of-day (HH:MM, 24h, in app timezone):
  // per-delivery override → global Settings → Reminder Defaults → 09:00
  const timeStr = delivery.reminderTime || s.default_reminder_time || '09:00';
  const [sendHour, sendMin] = String(timeStr).split(':').map((n) => parseInt(n, 10));
  const hh = Number.isInteger(sendHour) && sendHour >= 0 && sendHour <= 23 ? sendHour : 9;
  const mm = Number.isInteger(sendMin)  && sendMin  >= 0 && sendMin  <= 59 ? sendMin  : 0;

  const channels = [];
  if (delivery.notifyWhatsapp) channels.push('whatsapp');
  if (delivery.notifyEmail) channels.push('email');

  const now = new Date();
  const dueDate = new Date(delivery.dueDate);
  const startDate = delivery.startDate ? new Date(delivery.startDate) : null;

  let created = 0;
  let skipped = 0;

  for (const offset of offsets) {
    // Calculate run time: offset days before due, at the configured time (app TZ)
    const runDateLocal = subDays(dueDate, offset);
    const runDateIST = new Date(runDateLocal);
    runDateIST.setHours(0, 0, 0, 0);
    const runAt = fromZonedTime(
      new Date(runDateIST.getFullYear(), runDateIST.getMonth(), runDateIST.getDate(), hh, mm, 0),
      TZ
    );

    // Skip if in the past
    if (isBefore(runAt, now)) { skipped++; continue; }
    // Skip if before startDate
    if (startDate && isBefore(runAt, startDate)) { skipped++; continue; }
    // Skip if after dueDate
    if (isAfter(runAt, dueDate)) { skipped++; continue; }

    for (const channel of channels) {
      const dedupeKey = `d${deliveryId}:o${offset}:c${channel}`;
      try {
        await prisma.scheduledReminder.upsert({
          where: { dedupeKey },
          update: { runAt, status: 'pending' },
          create: {
            deliveryId,
            channel,
            runAt,
            status: 'pending',
            daysBeforeDue: offset,
            dedupeKey,
          },
        });
        created++;
      } catch (e) {
        logger.warn({ dedupeKey, err: e.message }, 'Upsert reminder failed');
        skipped++;
      }
    }
  }

  if (userId) {
    await prisma.auditLog.create({
      data: {
        userId,
        customerId: delivery.customerId,
        entityType: 'delivery',
        entityId: deliveryId,
        action: 'GENERATE_REMINDERS',
        after: { offsets, channels, created, skipped },
      },
    });
  }

  logger.info({ deliveryId, created, skipped }, 'Reminders generated');
  return { created, skipped };
}

/**
 * Snooze a reminder: cancel existing, create a new one in N hours.
 */
async function snoozeReminder(reminderId, hours, userId = null) {
  const reminder = await prisma.scheduledReminder.findUnique({ where: { id: reminderId } });
  if (!reminder) throw new NotFoundError('Reminder');

  const newRunAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  const newDedupeKey = `${reminder.dedupeKey}:snooze:${Date.now()}`;

  await prisma.$transaction([
    prisma.scheduledReminder.update({ where: { id: reminderId }, data: { status: 'snoozed', snoozedUntil: newRunAt } }),
    prisma.scheduledReminder.create({
      data: {
        deliveryId: reminder.deliveryId,
        deliveryItemId: reminder.deliveryItemId,
        channel: reminder.channel,
        runAt: newRunAt,
        status: 'pending',
        daysBeforeDue: null,
        dedupeKey: newDedupeKey,
      },
    }),
  ]);

  if (userId) {
    await prisma.auditLog.create({
      data: {
        userId,
        entityType: 'reminder',
        entityId: reminderId,
        action: 'SNOOZE',
        after: { hours, newRunAt },
      },
    });
  }

  logger.info({ reminderId, hours, newRunAt }, 'Reminder snoozed');
  return { newRunAt };
}

/**
 * Reschedule a reminder to a specific datetime.
 */
async function rescheduleReminder(reminderId, runAt, userId = null) {
  const reminder = await prisma.scheduledReminder.findUnique({
    where: { id: reminderId },
    include: { delivery: true },
  });
  if (!reminder) throw new NotFoundError('Reminder');

  const dt = new Date(runAt);
  if (isBefore(dt, new Date())) throw new ValidationError('Reschedule date cannot be in the past');
  if (reminder.delivery.dueDate && isAfter(dt, new Date(reminder.delivery.dueDate))) {
    throw new ValidationError('Reschedule date must be before or on the delivery due date');
  }
  if (reminder.delivery.startDate && isBefore(dt, new Date(reminder.delivery.startDate))) {
    throw new ValidationError('Reschedule date must be after delivery start date');
  }

  const newDedupeKey = `${reminder.dedupeKey}:reschedule:${Date.now()}`;

  await prisma.$transaction([
    prisma.scheduledReminder.update({ where: { id: reminderId }, data: { status: 'snoozed' } }),
    prisma.scheduledReminder.create({
      data: {
        deliveryId: reminder.deliveryId,
        deliveryItemId: reminder.deliveryItemId,
        channel: reminder.channel,
        runAt: dt,
        status: 'pending',
        daysBeforeDue: null,
        dedupeKey: newDedupeKey,
      },
    }),
  ]);

  if (userId) {
    await prisma.auditLog.create({
      data: { userId, entityType: 'reminder', entityId: reminderId, action: 'RESCHEDULE', after: { runAt } },
    });
  }

  return { newRunAt: dt };
}

/**
 * Stop reminders – either for a specific item or the whole delivery.
 */
async function stopReminders(deliveryId, scope = 'delivery', deliveryItemId = null, userId = null) {
  const where = {
    deliveryId,
    status: { in: ['pending', 'snoozed'] },
    ...(scope === 'material' && deliveryItemId ? { deliveryItemId } : {}),
  };

  const updated = await prisma.scheduledReminder.updateMany({
    where,
    data: { status: 'stopped' },
  });

  if (userId) {
    await prisma.auditLog.create({
      data: {
        userId,
        entityType: 'delivery',
        entityId: deliveryId,
        action: 'STOP_REMINDERS',
        after: { scope, deliveryItemId, count: updated.count },
      },
    });
  }

  return { stopped: updated.count };
}

/**
 * Restart reminders – stops existing pending ones, regenerates.
 */
async function restartReminders(deliveryId, userId = null) {
  await stopReminders(deliveryId, 'delivery', null, userId);
  return generateReminders(deliveryId, userId);
}

function buildReminderWhere({ deliveryId, customerId, status, from, to } = {}) {
  return {
    ...(deliveryId ? { deliveryId: parseInt(deliveryId) } : {}),
    ...(customerId ? { delivery: { customerId: parseInt(customerId) } } : {}),
    ...(status ? { status } : {}),
    ...(from || to ? {
      runAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(to) }   : {}),
      },
    } : {}),
  };
}

/**
 * List reminders for a delivery or all upcoming.
 */
async function listReminders({ deliveryId, customerId, status, from, to, page = 1, pageSize = 50 } = {}) {
  const where = buildReminderWhere({ deliveryId, customerId, status, from, to });
  const [data, total] = await Promise.all([
    prisma.scheduledReminder.findMany({
      where,
      orderBy: { runAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        delivery: { select: { id: true, forecastMonth: true, dueDate: true, customer: { select: { name: true } } } },
        deliveryItem: { select: { partNumber: true, partName: true } },
      },
    }),
    prisma.scheduledReminder.count({ where }),
  ]);
  return { data, total };
}

/**
 * Permanently delete scheduled reminder records matching the filters.
 * WARNING: deleting 'pending'/'snoozed' reminders stops those notifications
 * from ever being sent. Pass no filters to clear everything.
 */
async function clearReminders({ deliveryId, customerId, status, from, to } = {}, userId = null) {
  const where = buildReminderWhere({ deliveryId, customerId, status, from, to });
  const result = await prisma.scheduledReminder.deleteMany({ where });

  if (userId) {
    await prisma.auditLog.create({
      data: {
        userId,
        entityType: 'scheduled_reminder',
        action: 'CLEAR_REMINDERS',
        after: { deleted: result.count, filters: { deliveryId, customerId, status, from, to } },
      },
    });
  }

  logger.info({ deleted: result.count, userId }, 'Scheduled reminders cleared');
  return { deleted: result.count };
}

module.exports = {
  generateReminders, snoozeReminder, rescheduleReminder,
  stopReminders, restartReminders, listReminders, clearReminders,
};
