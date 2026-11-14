/**
 * Delivery service – CRUD, sheet edits, MSL recalculation, re-apply defaults.
 */

const prisma = require('../config/prisma');
const mslService = require('./mslService');
const { NotFoundError, ValidationError } = require('../utils/errors');
const logger = require('../config/logger');
const { endOfDay } = require('date-fns');

/**
 * List deliveries, optionally filtered by customerId.
 * Includes per-delivery MSL summary counts (BELOW_MIN / ABOVE_MAX / NORMAL / NOT_CONFIGURED)
 * so callers don't need a separate request per row.
 */
async function listDeliveries({ customerId, status, page = 1, pageSize = 20 } = {}) {
  const where = {
    deletedAt: null,
    ...(customerId ? { customerId: parseInt(customerId) } : {}),
    ...(status ? { status } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.delivery.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, supplierCode: true } },
        forecast: { select: { id: true, fileName: true, forecastMonth: true, sentDate: true } },
        _count: { select: { items: { where: { deletedAt: null } } } },
        items: {
          where: { deletedAt: null },
          select: { mslStatus: true },
        },
      },
    }),
    prisma.delivery.count({ where }),
  ]);

  // Compute mslSummary inline so the dashboard gets it without extra requests
  const enriched = data.map((d) => {
    const summary = { BELOW_MIN: 0, NORMAL: 0, ABOVE_MAX: 0, NOT_CONFIGURED: 0, total: d.items.length };
    d.items.forEach((i) => { if (summary[i.mslStatus] !== undefined) summary[i.mslStatus]++; });
    const { items: _items, ...rest } = d; // strip raw items array, expose only summary
    return { ...rest, mslSummary: summary };
  });

  return { data: enriched, total };
}

/**
 * Get a single delivery with all items and columns.
 */
async function getDelivery(id) {
  const delivery = await prisma.delivery.findFirst({
    where: { id, deletedAt: null },
    include: {
      customer: true,
      forecast: true,
      items: {
        where: { deletedAt: null },
        orderBy: { rowOrder: 'asc' },
      },
      sheetColumns: { orderBy: { colOrder: 'asc' } },
      notificationLogs: {
        orderBy: { sentAt: 'desc' },
        take: 50,
      },
    },
  });
  if (!delivery) throw new NotFoundError('Delivery');

  // Attach invoiced (delivered) quantities per part — sums applied invoices
  // for this customer, matched by part number, so the material sheet can show
  // which forecast lines have already been dispatched.
  const invoices = await prisma.invoice.findMany({
    where: { customerId: delivery.customerId, status: 'applied', deletedAt: null },
    include: { items: true },
  });
  const invoicedMap = new Map();
  for (const inv of invoices) {
    for (const it of inv.items) {
      invoicedMap.set(it.partNumber, (invoicedMap.get(it.partNumber) || 0) + it.qty);
    }
  }

  for (const item of delivery.items) {
    const invoiced = invoicedMap.get(item.partNumber) ?? 0;
    item.invoicedQty = invoiced;
    // Pending = forecast qty not yet covered by applied invoices —
    // i.e. how much still needs to be delivered to the customer
    item.pendingQty = Math.max(0, (item.totalQty ?? 0) - invoiced);
    item.deliveryStatus =
      (item.totalQty ?? 0) > 0 && invoiced >= item.totalQty ? 'delivered'
      : invoiced > 0 ? 'partial'
      : 'not_recorded';
  }

  return delivery;
}

/**
 * Update delivery schedule dates.
 */
async function updateDeliverySchedule(id, { startDate, dueDate, notifyWhatsapp, notifyEmail, reminderOffsets, reminderTime, customReminderAt }, userId) {
  const delivery = await prisma.delivery.findFirst({ where: { id, deletedAt: null } });
  if (!delivery) throw new NotFoundError('Delivery');

  if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
    throw new ValidationError('Due date must be on or after start date');
  }

  const data = {};
  if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (notifyWhatsapp !== undefined) data.notifyWhatsapp = notifyWhatsapp;
  if (notifyEmail !== undefined) data.notifyEmail = notifyEmail;
  if (reminderOffsets !== undefined) data.reminderOffsets = reminderOffsets ? JSON.stringify(reminderOffsets) : null;
  if (reminderTime !== undefined) data.reminderTime = reminderTime || null;

  const updated = await prisma.delivery.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      userId,
      customerId: delivery.customerId,
      entityType: 'delivery',
      entityId: id,
      action: 'UPDATE_SCHEDULE',
      before: { startDate: delivery.startDate, dueDate: delivery.dueDate },
      after: { startDate, dueDate },
    },
  });

  // Regenerate reminders so schedule/channel/offset changes take effect.
  // Due date cleared → stop pending reminders; otherwise stop + regenerate.
  let reminders = null;
  try {
    const reminderService = require('./reminderService');
    reminders = updated.dueDate
      ? await reminderService.restartReminders(id, userId)
      : await reminderService.stopReminders(id, 'delivery', null, userId);
  } catch (e) {
    require('../config/logger').warn({ err: e.message, deliveryId: id }, 'Reminder regeneration after schedule update failed');
  }

  // One-time exact reminder at a specific date+time (per enabled channel).
  // Runs AFTER restartReminders so stop+generate doesn't wipe it.
  if (customReminderAt) {
    const probe = new Date(customReminderAt);
    if (isNaN(probe.getTime())) throw new ValidationError('Invalid custom reminder date/time');
  }
  if (customReminderAt !== undefined) {
    try {
      const runAt = customReminderAt ? new Date(customReminderAt) : null;
      const channels = [];
      if (updated.notifyWhatsapp) channels.push('whatsapp');
      if (updated.notifyEmail) channels.push('email');
      for (const ch of ['whatsapp', 'email']) {
        const dedupeKey = `d${id}:custom:c${ch}`;
        if (runAt && channels.includes(ch)) {
          await prisma.scheduledReminder.upsert({
            where: { dedupeKey },
            update: { runAt, status: 'pending' },
            create: { deliveryId: id, channel: ch, runAt, status: 'pending', dedupeKey },
          });
        } else {
          await prisma.scheduledReminder.deleteMany({
            where: { dedupeKey, status: { in: ['pending', 'snoozed'] } },
          });
        }
      }
    } catch (e) {
      require('../config/logger').warn({ err: e.message, deliveryId: id }, 'Custom reminder update failed');
    }
  }

  return { ...updated, reminders };
}

/**
 * Save the material sheet (transactional).
 * items: [{ id?, partNumber, partName, totalQty, actualStock?, extraColumns? }]
 */
async function saveSheet(deliveryId, { items, columns }, userId) {
  return prisma.$transaction(async (tx) => {
    const delivery = await tx.delivery.findFirst({
      where: { id: deliveryId, deletedAt: null },
      include: { items: { where: { deletedAt: null } } },
    });
    if (!delivery) throw new NotFoundError('Delivery');

    // Soft-delete all existing items
    await tx.deliveryItem.updateMany({
      where: { deliveryId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    // Batch-resolve MSL ranges for all parts in one set of DB calls (not N calls)
    const partNumbers = items.map((i) => i.partNumber);
    const mslMap = await mslService.resolveBatch(partNumbers, delivery.customerId);

    // Build new items
    const newItems = items.map((item, idx) => {
      const resolved = mslMap.get(item.partNumber) ?? { min: null, max: null, source: null };
      const qty = item.totalQty ?? 0;
      const status = mslService.computeStatus(qty, resolved);
      return {
        deliveryId,
        partNumber: item.partNumber,
        partName: item.partName,
        totalQty: qty,
        actualStock: item.actualStock ?? null,
        snapshotMinQty: resolved.min,
        snapshotMaxQty: resolved.max,
        snapshotSource: resolved.source,
        mslStatus: status,
        rowOrder: idx,
        extraColumns: item.extraColumns ?? null,
      };
    });

    if (newItems.length > 0) {
      await tx.deliveryItem.createMany({ data: newItems });
    }

    // Update columns if provided
    if (columns) {
      await tx.sheetColumn.deleteMany({ where: { deliveryId } });
      if (columns.length > 0) {
        await tx.sheetColumn.createMany({
          data: columns.map((c, i) => ({
            deliveryId,
            key: c.key,
            label: c.label,
            colType: c.colType || 'text',
            colOrder: i,
            width: c.width || 150,
          })),
        });
      }
    }

    await tx.auditLog.create({
      data: {
        userId,
        customerId: delivery.customerId,
        entityType: 'delivery_sheet',
        entityId: deliveryId,
        action: 'SAVE_SHEET',
        after: { itemCount: newItems.length },
      },
    });

    logger.info({ deliveryId, itemCount: newItems.length }, 'Sheet saved');
    return { itemCount: newItems.length };
  });
}

/**
 * Re-apply current MSL defaults to all items in a delivery.
 * This is the EXPLICIT user action — never automatic.
 */
async function reapplyDefaults(deliveryId, userId) {
  const delivery = await prisma.delivery.findFirst({
    where: { id: deliveryId, deletedAt: null },
    include: { items: { where: { deletedAt: null } } },
  });
  if (!delivery) throw new NotFoundError('Delivery');

  // Batch-resolve MSL for all parts (one set of DB round-trips, not N)
  const partNumbers = delivery.items.map((i) => i.partNumber);
  const mslMap = await mslService.resolveBatch(partNumbers, delivery.customerId);

  const updates = delivery.items.map((item) => {
    const resolved = mslMap.get(item.partNumber) ?? { min: null, max: null, source: null };
    const status = mslService.computeStatus(item.totalQty, resolved);
    return prisma.deliveryItem.update({
      where: { id: item.id },
      data: {
        snapshotMinQty: resolved.min,
        snapshotMaxQty: resolved.max,
        snapshotSource: resolved.source,
        mslStatus: status,
      },
    });
  });

  await Promise.all(updates);

  await prisma.auditLog.create({
    data: {
      userId,
      customerId: delivery.customerId,
      entityType: 'delivery',
      entityId: deliveryId,
      action: 'REAPPLY_DEFAULTS',
      after: { itemCount: delivery.items.length },
    },
  });

  return { updatedCount: delivery.items.length };
}

/**
 * Transition a delivery to 'delivered'.
 * Stops all pending reminders and records the delivery timestamp.
 */
async function markDelivered(id, { scope = 'whole' } = {}, userId) {
  const delivery = await prisma.delivery.findFirst({ where: { id, deletedAt: null } });
  if (!delivery) throw new NotFoundError('Delivery');
  if (delivery.status === 'delivered') throw new ValidationError('Delivery is already marked as delivered');
  if (delivery.status === 'cancelled') throw new ValidationError('Cannot mark a cancelled delivery as delivered');

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({
      where: { id },
      data: { status: 'delivered', deliveredAt: now, deliveredScope: scope },
    });
    await tx.scheduledReminder.updateMany({
      where: { deliveryId: id, status: { in: ['pending', 'sending', 'snoozed'] } },
      data: { status: 'stopped', lastError: 'Delivery marked as delivered' },
    });
    await tx.auditLog.create({
      data: {
        userId,
        customerId: delivery.customerId,
        entityType: 'delivery',
        entityId: id,
        action: 'MARK_DELIVERED',
        after: { scope, deliveredAt: now },
      },
    });
  });

  logger.info({ deliveryId: id, userId, scope }, 'Delivery marked as delivered');
  return { id, status: 'delivered', deliveredAt: now, deliveredScope: scope };
}

/**
 * Cancel a delivery — stops reminders, sets status to 'cancelled'.
 */
async function cancelDelivery(id, userId) {
  const delivery = await prisma.delivery.findFirst({ where: { id, deletedAt: null } });
  if (!delivery) throw new NotFoundError('Delivery');
  if (delivery.status === 'cancelled') throw new ValidationError('Delivery is already cancelled');
  if (delivery.status === 'delivered') throw new ValidationError('Cannot cancel a delivered delivery');

  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id }, data: { status: 'cancelled' } });
    await tx.scheduledReminder.updateMany({
      where: { deliveryId: id, status: { in: ['pending', 'sending', 'snoozed'] } },
      data: { status: 'stopped', lastError: 'Delivery cancelled' },
    });
    await tx.auditLog.create({
      data: {
        userId,
        customerId: delivery.customerId,
        entityType: 'delivery',
        entityId: id,
        action: 'CANCEL',
        before: { status: delivery.status },
      },
    });
  });

  logger.info({ deliveryId: id, userId }, 'Delivery cancelled');
  return { id, status: 'cancelled' };
}

/**
 * Soft-delete a delivery: hides it from lists, stops pending reminders,
 * and keeps items/logs for audit. Recoverable via DB if ever needed.
 */
async function deleteDelivery(id, userId) {
  const delivery = await prisma.delivery.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { items: { where: { deletedAt: null } } } } },
  });
  if (!delivery) throw new NotFoundError('Delivery');

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id }, data: { deletedAt: now } });
    await tx.deliveryItem.updateMany({
      where: { deliveryId: id, deletedAt: null },
      data: { deletedAt: now },
    });
    // Stop any reminders that haven't fired yet
    await tx.scheduledReminder.updateMany({
      where: { deliveryId: id, status: { in: ['pending', 'sending', 'snoozed'] } },
      data: { status: 'stopped', lastError: 'Delivery deleted' },
    });
    await tx.auditLog.create({
      data: {
        userId,
        customerId: delivery.customerId,
        entityType: 'delivery',
        entityId: id,
        action: 'DELETE',
        before: {
          customerId: delivery.customerId,
          forecastMonth: delivery.forecastMonth,
          status: delivery.status,
          itemCount: delivery._count.items,
        },
      },
    });
  });

  logger.info({ deliveryId: id, userId }, 'Delivery soft-deleted');
  return { id };
}

/**
 * Get MSL status summary for a delivery.
 */
async function getMslSummary(deliveryId) {
  const items = await prisma.deliveryItem.findMany({
    where: { deliveryId, deletedAt: null },
    select: { mslStatus: true },
  });

  const counts = { BELOW_MIN: 0, NORMAL: 0, ABOVE_MAX: 0, NOT_CONFIGURED: 0, total: items.length };
  items.forEach((i) => { if (counts[i.mslStatus] !== undefined) counts[i.mslStatus]++; });
  return counts;
}

/**
 * Get KPI dashboard data.
 */
async function getDashboardKpis() {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    activeDeliveries,
    belowMin,
    aboveMax,
    dueSoon,
    remindersToday,
    failedNotifications,
  ] = await Promise.all([
    prisma.delivery.count({ where: { status: 'active', deletedAt: null } }),
    prisma.deliveryItem.count({ where: { mslStatus: 'BELOW_MIN', delivery: { status: 'active', deletedAt: null }, deletedAt: null } }),
    prisma.deliveryItem.count({ where: { mslStatus: 'ABOVE_MAX', delivery: { status: 'active', deletedAt: null }, deletedAt: null } }),
    prisma.delivery.count({ where: { status: 'active', deletedAt: null, dueDate: { gte: now, lte: in7Days } } }),
    prisma.scheduledReminder.count({ where: { status: 'pending', runAt: { gte: now, lte: endOfDay(now) } } }),
    prisma.notificationOutbox.count({ where: { status: 'failed' } }),
  ]);

  return { activeDeliveries, belowMin, aboveMax, dueSoon, remindersToday, failedNotifications };
}

module.exports = {
  listDeliveries, getDelivery, updateDeliverySchedule,
  saveSheet, reapplyDefaults, getMslSummary, getDashboardKpis,
  deleteDelivery, markDelivered, cancelDelivery,
};
