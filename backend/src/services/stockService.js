/**
 * Stock service – global parts inventory: manual CRUD, quantity adjustments,
 * and bulk-update triggered after forecast activation.
 */

const prisma = require('../config/prisma');
const repo = require('../repositories/stockRepository');
const { normalisePartNumber } = require('../parsers/parseUtils');
const { ValidationError, NotFoundError } = require('../utils/errors');
const logger = require('../config/logger');

// ── List / Read ───────────────────────────────────────────────────────────────

async function listStocks({ search = '', page = 1, pageSize = 50 } = {}) {
  const [data, total] = await repo.listStocks({ search, page, pageSize });
  return { data, total };
}

async function getStock(id) {
  const stock = await repo.findStockById(id);
  if (!stock) throw new NotFoundError('Stock');
  return stock;
}

// ── Create ────────────────────────────────────────────────────────────────────

async function createStock({ partNumber, partName, quantity = 0, unit, notes }, userId) {
  const pn = normalisePartNumber(partNumber);
  if (!pn) throw new ValidationError('partNumber is required');

  const existing = await repo.findStockByPartNumber(pn);
  if (existing) {
    throw new ValidationError(`A stock entry for part number "${pn}" already exists. Use adjust to change its quantity.`);
  }

  const stock = await prisma.$transaction(async (tx) => {
    const s = await tx.stock.create({
      data: {
        partNumber: pn,
        partName: partName.trim(),
        quantity: parseInt(quantity, 10) || 0,
        unit: unit?.trim() || null,
        notes: notes?.trim() || null,
      },
    });
    // Initial transaction log
    await tx.stockTransaction.create({
      data: {
        stockId: s.id,
        deltaQty: s.quantity,
        reason: 'MANUAL_SET',
        userId: userId ?? null,
        note: 'Initial stock entry',
      },
    });
    return s;
  });

  logger.info({ stockId: stock.id, partNumber: pn, quantity: stock.quantity }, 'Stock created');
  return stock;
}

// ── Update (metadata only) ────────────────────────────────────────────────────

async function updateStock(id, { partName, unit, notes }, userId) {
  const existing = await repo.findStockById(id);
  if (!existing) throw new NotFoundError('Stock');

  const updated = await repo.updateStock(id, {
    ...(partName !== undefined ? { partName: partName.trim() } : {}),
    ...(unit !== undefined ? { unit: unit?.trim() || null } : {}),
    ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
  });

  logger.info({ stockId: id }, 'Stock metadata updated');
  return updated;
}

// ── Adjust quantity ───────────────────────────────────────────────────────────

/**
 * Set or adjust a stock's quantity.
 * mode: 'set' replaces the value; 'adjust' adds the delta.
 */
async function adjustStock(id, { quantity, mode = 'adjust', note }, userId) {
  const existing = await repo.findStockById(id);
  if (!existing) throw new NotFoundError('Stock');

  const delta =
    mode === 'set'
      ? parseInt(quantity, 10) - existing.quantity
      : parseInt(quantity, 10);

  const newQty = existing.quantity + delta;
  if (newQty < 0) {
    throw new ValidationError(`Cannot reduce quantity below 0 (current: ${existing.quantity}, delta: ${delta})`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.stock.update({
      where: { id },
      data: { quantity: newQty },
    });
    await tx.stockTransaction.create({
      data: {
        stockId: id,
        deltaQty: delta,
        reason: mode === 'set' ? 'MANUAL_SET' : 'MANUAL_ADJUST',
        userId: userId ?? null,
        note: note?.trim() || null,
      },
    });
    return s;
  });

  logger.info({ stockId: id, delta, newQty }, 'Stock quantity adjusted');
  return updated;
}

// ── Soft delete ───────────────────────────────────────────────────────────────

async function deleteStock(id) {
  const existing = await repo.findStockById(id);
  if (!existing) throw new NotFoundError('Stock');
  await repo.softDeleteStock(id);
  logger.info({ stockId: id }, 'Stock soft-deleted');
}

// ── Forecast integration ──────────────────────────────────────────────────────

/**
 * Called after a forecast is activated.
 * For each row (partNumber + partName + totalQty), we:
 *   - upsert a Stock record (create if missing, keep existing if present)
 *   - record a FORECAST_UPLOAD transaction noting the forecasted quantity
 *
 * We do NOT automatically add/subtract from stock quantity here — the user
 * manages their actual stock manually. We just log the forecast event so the
 * user can see what was ordered and use the global stocks panel to reconcile.
 *
 * Returns a summary: { created, updated, skipped }
 */
async function recordForecastUpload(rows, forecastId, userId) {
  if (!rows || rows.length === 0) return { created: 0, updated: 0 };

  const partNumbers = rows.map((r) => normalisePartNumber(r.partNumber)).filter(Boolean);
  const existing = await repo.findManyByPartNumbers(partNumbers);
  const existingMap = new Map(existing.map((s) => [s.partNumber, s]));

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const pn = normalisePartNumber(row.partNumber);
    if (!pn) continue;

    try {
      const forecasted = parseInt(row.totalQty, 10) || 0;

      if (existingMap.has(pn)) {
        const stock = existingMap.get(pn);
        // Keep the part name in sync — forecast uploads carry the fuller name
        const newName = (row.partName || '').trim();
        if (newName && newName !== stock.partName) {
          await prisma.stock.update({ where: { id: stock.id }, data: { partName: newName } });
        }
        // Log the forecast event (don't auto-change quantity)
        await prisma.stockTransaction.create({
          data: {
            stockId: stock.id,
            deltaQty: 0,
            reason: 'FORECAST_UPLOAD',
            referenceId: forecastId ?? null,
            refType: 'forecast',
            userId: userId ?? null,
            note: `Forecast: ${forecasted} pcs ordered (${row.partName || ''})`,
          },
        });
        updated++;
      } else {
        // Auto-create a stock entry at 0 quantity so users know the part exists
        await prisma.$transaction(async (tx) => {
          const s = await tx.stock.create({
            data: {
              partNumber: pn,
              partName: (row.partName || '').trim(),
              quantity: 0,
            },
          });
          await tx.stockTransaction.create({
            data: {
              stockId: s.id,
              deltaQty: 0,
              reason: 'FORECAST_UPLOAD',
              referenceId: forecastId ?? null,
              refType: 'forecast',
              userId: userId ?? null,
              note: `Auto-created from forecast: ${forecasted} pcs ordered`,
            },
          });
        });
        created++;
      }
    } catch (e) {
      logger.warn({ partNumber: pn, err: e.message }, 'Failed to sync stock from forecast row');
    }
  }

  logger.info({ forecastId, created, updated }, 'Forecast stock sync complete');
  return { created, updated };
}

module.exports = {
  listStocks,
  getStock,
  createStock,
  updateStock,
  adjustStock,
  deleteStock,
  recordForecastUpload,
};
