/**
 * Forecast service – upload, parse, version management, delivery creation.
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../config/prisma');
const config = require('../config');
const { parsePdf } = require('../parsers/pdfParser');
const { parseExcel } = require('../parsers/excelParser');
const mslService = require('./mslService');
const { NotFoundError, ValidationError } = require('../utils/errors');
const logger = require('../config/logger');

/**
 * Parse an uploaded file and return rows + meta without saving.
 * Used for the Review step of the Upload wizard.
 */
async function parseFile(filePath, fileType) {
  if (fileType === 'pdf') {
    return parsePdf(filePath);
  } else if (fileType === 'xlsx' || fileType === 'xls') {
    return parseExcel(filePath);
  }
  throw new ValidationError(`Unsupported file type: ${fileType}`);
}

/**
 * Save a forecast (after user review). Moves the file to permanent storage.
 * Re-uploading same customer+month → new version (never overwrites).
 */
async function saveForecast({ customerId, tempFilePath, fileName, fileType, parsedData, userId }) {
  // Get customer
  const customer = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
  if (!customer) throw new NotFoundError('Customer');

  const { rows, meta, warnings, needsReview, confidence } = parsedData;
  const forecastMonth = meta.forecastMonth;
  if (!forecastMonth) throw new ValidationError('Could not determine forecast month from file');

  // Version: count existing forecasts for same customer+month
  const existingCount = await prisma.forecast.count({
    where: { customerId, forecastMonth },
  });
  const version = existingCount + 1;

  // Permanent file path
  const storageDir = path.join(
    config.storage.root,
    'uploads',
    `customer_${customerId}`,
    forecastMonth
  );
  fs.mkdirSync(storageDir, { recursive: true });
  const ext = path.extname(fileName);
  const permanentName = `v${version}_${Date.now()}${ext}`;
  const permanentPath = path.join(storageDir, permanentName);
  fs.renameSync(tempFilePath, permanentPath);

  // Save forecast record
  const forecast = await prisma.forecast.create({
    data: {
      customerId,
      forecastMonth,
      sentDate: meta.sentDate ? new Date(meta.sentDate) : null,
      filePath: permanentPath,
      fileName: fileName,
      fileType,
      version,
      parserConfidence: confidence,
      parseWarnings: warnings.length > 0 ? warnings : null,
      status: 'draft',
    },
  });

  logger.info({ forecastId: forecast.id, customerId, forecastMonth, version }, 'Forecast saved');
  return { forecast, rows, meta, warnings, needsReview };
}

/**
 * Activate a forecast: create Delivery + DeliveryItems with snapshotted MSL.
 * If a delivery already exists for the same forecastId, it's returned as-is.
 */
async function activateForecast({ forecastId, rows, startDate, dueDate, userId }) {
  return prisma.$transaction(async (tx) => {
    const forecast = await tx.forecast.findUnique({ where: { id: forecastId } });
    if (!forecast) throw new NotFoundError('Forecast');

    // Check for existing active delivery
    const existing = await tx.delivery.findFirst({
      where: { forecastId, deletedAt: null },
    });
    if (existing) return existing;

    // Create delivery
    const delivery = await tx.delivery.create({
      data: {
        customerId: forecast.customerId,
        forecastId,
        forecastMonth: forecast.forecastMonth,
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: 'active',
      },
    });

    // Snapshot MSL for each row
    const itemsData = [];
    for (const [idx, row] of rows.entries()) {
      const resolved = await mslService.resolve(row.partNumber, forecast.customerId);
      const status = mslService.computeStatus(row.totalQty, resolved);

      itemsData.push({
        deliveryId: delivery.id,
        partNumber: row.partNumber,
        partName: row.partName,
        totalQty: row.totalQty,
        snapshotMinQty: resolved.min,
        snapshotMaxQty: resolved.max,
        snapshotSource: resolved.source,
        mslStatus: status,
        rowOrder: idx,
        needsReview: row.needsReview ?? false,
        reviewNote: row.reviewNote ?? null,
        extraColumns: row.extraColumns ?? null,
      });
    }

    if (itemsData.length > 0) {
      await tx.deliveryItem.createMany({ data: itemsData });
    }

    // Mark forecast as active
    await tx.forecast.update({
      where: { id: forecastId },
      data: { status: 'active' },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        userId,
        customerId: forecast.customerId,
        entityType: 'delivery',
        entityId: delivery.id,
        action: 'ACTIVATE',
        after: { forecastId, itemCount: itemsData.length },
      },
    });

    logger.info({ deliveryId: delivery.id, forecastId, itemCount: itemsData.length }, 'Delivery activated');

    // Generate reminders (non-blocking – runs after tx commits)
    setImmediate(async () => {
      try {
        const reminderService = require('./reminderService');
        await reminderService.generateReminders(delivery.id, userId);
      } catch (e) {
        const logger2 = require('../config/logger');
        logger2.warn({ err: e.message }, 'Reminder generation after activation failed');
      }
    });

    return delivery;
  });
}

/**
 * List forecasts for a customer.
 */
async function listForecasts(customerId) {
  return prisma.forecast.findMany({
    where: { customerId, deletedAt: null },
    orderBy: [{ forecastMonth: 'desc' }, { version: 'desc' }],
  });
}

/**
 * Get a single forecast by ID.
 */
async function getForecast(id) {
  const f = await prisma.forecast.findFirst({ where: { id, deletedAt: null } });
  if (!f) throw new NotFoundError('Forecast');
  return f;
}

module.exports = { parseFile, saveForecast, activateForecast, listForecasts, getForecast };
