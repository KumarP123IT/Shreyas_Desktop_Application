/**
 * Invoice service – upload, parse, and apply invoices against global stock.
 *
 * Flow:
 *   1. uploadInvoice  – saves PDF, parses it, creates Invoice + InvoiceItems (status: pending)
 *   2. applyInvoice   – deducts each item's qty from global Stock (status: applied)
 *   3. cancelInvoice  – marks cancelled; does NOT reverse stock deductions
 *   4. listInvoices / getInvoice – read access
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const prisma  = require('../config/prisma');
const config  = require('../config');
const { parseInvoice }     = require('../parsers/invoiceParser');
const { normalisePartNumber } = require('../parsers/parseUtils');
const { NotFoundError, ValidationError } = require('../utils/errors');
const logger = require('../config/logger');

// ── Upload & parse ────────────────────────────────────────────────────────────

async function uploadInvoice({ customerId, tempFilePath, fileName, userId }) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
  if (!customer) throw new NotFoundError('Customer');

  // Parse the PDF
  const { rows, meta, warnings, confidence, isOcr } = await parseInvoice(tempFilePath);

  // Move to permanent storage
  const storageDir = path.join(config.storage.root, 'uploads', `customer_${customerId}`, 'invoices');
  fs.mkdirSync(storageDir, { recursive: true });
  const ext = path.extname(fileName);
  const permanentName = `inv_${Date.now()}${ext}`;
  const permanentPath = path.join(storageDir, permanentName);
  fs.renameSync(tempFilePath, permanentPath);

  // Resolve stock ids for matched part numbers
  const partNumbers = rows.map((r) => normalisePartNumber(r.partNumber)).filter(Boolean);
  const stocks = partNumbers.length > 0
    ? await prisma.stock.findMany({ where: { partNumber: { in: partNumbers }, deletedAt: null } })
    : [];
  const stockMap = new Map(stocks.map((s) => [s.partNumber, s.id]));

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          customerId,
          invoiceNo:   meta.invoiceNo   || null,
          invoiceDate: meta.invoiceDate ? new Date(meta.invoiceDate) : null,
          filePath:    permanentPath,
          fileName,
          fileType:    'pdf',
          status:      'pending',
        },
      });

      if (rows.length > 0) {
        await tx.invoiceItem.createMany({
          data: rows.map((r) => {
            const pn = normalisePartNumber(r.partNumber);
            return {
              invoiceId:  inv.id,
              partNumber: pn,
              partName:   r.partName || pn,
              qty:        parseInt(r.qty, 10) || 0,
              stockId:    stockMap.get(pn) ?? null,
              applied:    false,
            };
          }),
        });
      }

      await tx.auditLog.create({
        data: {
          userId,
          customerId,
          entityType: 'invoice',
          entityId:   inv.id,
          action:     'UPLOAD',
          after: { fileName, itemCount: rows.length, confidence, isOcr },
        },
      });

      return inv;
    });

    logger.info({ invoiceId: invoice.id, customerId, itemCount: rows.length }, 'Invoice uploaded');
    return { invoice, rows, meta, warnings, confidence };
  } catch (e) {
    try { fs.unlinkSync(permanentPath); } catch (_) {}
    throw e;
  }
}

// ── Apply (deduct from stocks) ────────────────────────────────────────────────

async function applyInvoice(invoiceId, userId) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    include: { items: true },
  });
  if (!invoice) throw new NotFoundError('Invoice');
  if (invoice.status === 'applied') throw new ValidationError('Invoice has already been applied.');
  if (invoice.status === 'cancelled') throw new ValidationError('Cannot apply a cancelled invoice.');
  if (invoice.items.length === 0) throw new ValidationError('Invoice has no line items to apply.');

  const results = [];

  await prisma.$transaction(async (tx) => {
    for (const item of invoice.items) {
      if (item.qty <= 0) continue;

      // Look up stock by partNumber (re-resolve in case stocks were added after upload)
      const stock = item.stockId
        ? await tx.stock.findFirst({ where: { id: item.stockId, deletedAt: null } })
        : await tx.stock.findFirst({ where: { partNumber: item.partNumber, deletedAt: null } });

      if (!stock) {
        results.push({ partNumber: item.partNumber, status: 'not_found', qty: item.qty });
        continue;
      }

      const newQty = Math.max(0, stock.quantity - item.qty);
      const delta  = newQty - stock.quantity; // negative

      await tx.stock.update({ where: { id: stock.id }, data: { quantity: newQty } });

      await tx.stockTransaction.create({
        data: {
          stockId:     stock.id,
          deltaQty:    delta,
          reason:      'INVOICE_APPLIED',
          referenceId: invoice.id,
          refType:     'invoice',
          userId:      userId ?? null,
          note: `Invoice ${invoice.invoiceNo || invoice.id}: ${item.qty} pcs dispatched`,
        },
      });

      await tx.invoiceItem.update({ where: { id: item.id }, data: { applied: true, stockId: stock.id } });
      results.push({ partNumber: item.partNumber, status: 'applied', deducted: item.qty, newQty });
    }

    await tx.invoice.update({ where: { id: invoiceId }, data: { status: 'applied' } });

    await tx.auditLog.create({
      data: {
        userId,
        customerId: invoice.customerId,
        entityType: 'invoice',
        entityId:   invoiceId,
        action:     'APPLY',
        after: { results },
      },
    });
  });

  logger.info({ invoiceId, results }, 'Invoice applied — stocks deducted');
  return { invoiceId, results };
}

// ── Cancel ────────────────────────────────────────────────────────────────────

async function cancelInvoice(invoiceId, userId) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, deletedAt: null } });
  if (!invoice) throw new NotFoundError('Invoice');
  if (invoice.status === 'applied') throw new ValidationError('Applied invoices cannot be cancelled. Add a manual stock adjustment instead.');

  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'cancelled' } });
  logger.info({ invoiceId }, 'Invoice cancelled');
}

// ── List / Get ────────────────────────────────────────────────────────────────

/**
 * Attach live stock info to invoice items for display. Stock is matched by
 * partNumber (same rule applyInvoice uses), so quantities shown are current.
 */
async function attachStockInfo(invoice) {
  const partNumbers = [...new Set(invoice.items.map((i) => i.partNumber).filter(Boolean))];
  const stocks = partNumbers.length
    ? await prisma.stock.findMany({
        where: { partNumber: { in: partNumbers }, deletedAt: null },
        select: { id: true, partNumber: true, quantity: true, unit: true },
      })
    : [];
  const byPn = new Map(stocks.map((s) => [s.partNumber, s]));
  return {
    ...invoice,
    items: invoice.items.map((item) => {
      const stock = byPn.get(item.partNumber) || null;
      return {
        ...item,
        stockQty:  stock ? stock.quantity : null,
        stockUnit: stock ? stock.unit : null,
        stockFound: !!stock,
      };
    }),
  };
}

async function listInvoices(customerId, { page = 1, pageSize = 50 } = {}) {
  const where = { customerId, deletedAt: null };
  const [data, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { items: true } } },
    }),
    prisma.invoice.count({ where }),
  ]);
  return { data, total };
}

async function getInvoice(invoiceId) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    include: {
      items: { orderBy: { id: 'asc' } },
      customer: { select: { id: true, name: true, supplierCode: true } },
    },
  });
  if (!invoice) throw new NotFoundError('Invoice');
  return attachStockInfo(invoice);
}

// ── Edit pending invoice items ────────────────────────────────────────────────

/**
 * Replace the line items of a PENDING invoice — used by the review screen so
 * users can fix parser mistakes (wrong part number, wrong qty) before
 * applying to stock. Re-resolves stockId for every row.
 *
 * items: [{ id, partNumber, partName, qty }]
 */
async function updateInvoiceItems(invoiceId, items, userId) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    include: { items: true },
  });
  if (!invoice) throw new NotFoundError('Invoice');
  if (invoice.status !== 'pending') {
    throw new ValidationError('Only pending invoices can be edited. Cancel and re-upload to change an applied invoice.');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('items must be a non-empty array');
  }

  const cleaned = items.map((it) => {
    const pn  = normalisePartNumber(it.partNumber);
    const qty = parseInt(it.qty, 10);
    if (!pn) throw new ValidationError('Every item needs a valid part number');
    if (!Number.isInteger(qty) || qty < 0) {
      throw new ValidationError(`Invalid quantity for part "${pn}"`);
    }
    return {
      id:         parseInt(it.id, 10),
      partNumber: pn,
      partName:   (it.partName || pn).trim(),
      qty,
    };
  });

  const existingIds = new Set(invoice.items.map((i) => i.id));
  for (const c of cleaned) {
    if (!Number.isInteger(c.id) || !existingIds.has(c.id)) {
      throw new ValidationError('One or more items do not belong to this invoice — reload and try again');
    }
  }

  // Re-resolve stock ids against current stocks
  const pns = [...new Set(cleaned.map((c) => c.partNumber))];
  const stocks = await prisma.stock.findMany({
    where: { partNumber: { in: pns }, deletedAt: null },
    select: { id: true, partNumber: true },
  });
  const stockMap = new Map(stocks.map((s) => [s.partNumber, s.id]));

  await prisma.$transaction(async (tx) => {
    for (const c of cleaned) {
      await tx.invoiceItem.update({
        where: { id: c.id },
        data: {
          partNumber: c.partNumber,
          partName:   c.partName,
          qty:        c.qty,
          stockId:    stockMap.get(c.partNumber) ?? null,
          applied:    false,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        userId,
        customerId: invoice.customerId,
        entityType: 'invoice',
        entityId:   invoiceId,
        action:     'UPDATE_ITEMS',
        after:      { itemCount: cleaned.length },
      },
    });
  });

  logger.info({ invoiceId, itemCount: cleaned.length }, 'Invoice items updated');
  return getInvoice(invoiceId);
}

module.exports = { uploadInvoice, applyInvoice, cancelInvoice, listInvoices, getInvoice, updateInvoiceItems };
