/**
 * Stock repository – raw DB access for stocks and transactions.
 */

const prisma = require('../config/prisma');

// ── Stock queries ─────────────────────────────────────────────────────────────

function listStocks({ search = '', page = 1, pageSize = 50 } = {}) {
  const where = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { partNumber: { contains: search } },
            { partName: { contains: search } },
          ],
        }
      : {}),
  };
  return Promise.all([
    prisma.stock.findMany({
      where,
      orderBy: [{ partNumber: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.stock.count({ where }),
  ]);
}

function findStockById(id) {
  return prisma.stock.findFirst({
    where: { id, deletedAt: null },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  });
}

function findStockByPartNumber(partNumber) {
  return prisma.stock.findFirst({
    where: { partNumber, deletedAt: null },
  });
}

function findManyByPartNumbers(partNumbers) {
  return prisma.stock.findMany({
    where: { partNumber: { in: partNumbers }, deletedAt: null },
  });
}

function createStock(data) {
  return prisma.stock.create({ data });
}

function updateStock(id, data) {
  return prisma.stock.update({ where: { id }, data });
}

function softDeleteStock(id) {
  return prisma.stock.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// ── Transaction queries ───────────────────────────────────────────────────────

function createTransaction(data) {
  return prisma.stockTransaction.create({ data });
}

function listTransactions(stockId, { page = 1, pageSize = 50 } = {}) {
  return prisma.stockTransaction.findMany({
    where: { stockId },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
}

module.exports = {
  listStocks,
  findStockById,
  findStockByPartNumber,
  findManyByPartNumbers,
  createStock,
  updateStock,
  softDeleteStock,
  createTransaction,
  listTransactions,
};
