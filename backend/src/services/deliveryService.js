/**
 * Delivery service – CRUD, sheet edits, MSL recalculation, re-apply defaults.
 */

const prisma = require('../config/prisma');
const mslService = require('./mslService');
const { NotFoundError, ValidationError } = require('../utils/errors');
const logger = require('../config/logger');

/**
 * List deliveries, optionally filtered by customerId.
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
      },
    }),
    prisma.delivery.count({ where }),
  ]);
  return { data, total };
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
  return delivery;
}

/**
 * Update delivery schedule dates.
 */
async function updateDeliverySchedule(id, { startDate, dueDate }, userId) {
  const delivery = await prisma.delivery.findFirst({ where: { id, deletedAt: null } });
  if (!delivery) throw new NotFoundError('Delivery');

  if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
    throw new ValidationError('Due date must be on or after start date');
  }

  const updated = await prisma.delivery.update({
    where: { id },
    data: {
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });

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

  return updated;
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

    // Re-create items with fresh MSL status
    const newItems = [];
    for (const [idx, item] of items.entries()) {
      const resolved = await mslService.resolve(item.partNumber, delivery.customerId);
      const qty = item.totalQty ?? 0;
      const status = mslService.computeStatus(qty, resolved);

      newItems.push({
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
      });
    }

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

  const updated = [];
  for (const item of delivery.items) {
    const resolved = await mslService.resolve(item.partNumber, delivery.customerId);
    const status = mslService.computeStatus(item.totalQty, resolved);
    await prisma.deliveryItem.update({
      where: { id: item.id },
      data: {
        snapshotMinQty: resolved.min,
        snapshotMaxQty: resolved.max,
        snapshotSource: resolved.source,
        mslStatus: status,
      },
    });
    updated.push({ ...item, snapshotMinQty: resolved.min, snapshotMaxQty: resolved.max, mslStatus: status });
  }

  await prisma.auditLog.create({
    data: {
      userId,
      customerId: delivery.customerId,
      entityType: 'delivery',
      entityId: deliveryId,
      action: 'REAPPLY_DEFAULTS',
      after: { itemCount: updated.length },
    },
  });

  return { updatedCount: updated.length };
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
    prisma.scheduledReminder.count({ where: { status: 'pending', runAt: { gte: new Date(now.toDateString()), lte: new Date(now.toDateString() + ' 23:59:59') } } }),
    prisma.notificationOutbox.count({ where: { status: 'failed' } }),
  ]);

  return { activeDeliveries, belowMin, aboveMax, dueSoon, remindersToday, failedNotifications };
}

module.exports = {
  listDeliveries, getDelivery, updateDeliverySchedule,
  saveSheet, reapplyDefaults, getMslSummary, getDashboardKpis,
  deleteDelivery,
};
