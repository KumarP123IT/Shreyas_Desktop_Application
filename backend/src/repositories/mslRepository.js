/**
 * MSL repository – global default, customer defaults, part overrides.
 */

const prisma = require('../config/prisma');

// ── Global default ────────────────────────────────────────────────────────────

async function getGlobalDefault() {
  return prisma.mslGlobalDefault.findUnique({ where: { id: 1 } });
}

async function upsertGlobalDefault(minQty, maxQty) {
  return prisma.mslGlobalDefault.upsert({
    where: { id: 1 },
    update: { minQty, maxQty },
    create: { id: 1, minQty, maxQty },
  });
}

// ── Customer defaults ─────────────────────────────────────────────────────────

async function getCustomerDefault(customerId) {
  return prisma.mslCustomerDefault.findUnique({ where: { customerId } });
}

async function upsertCustomerDefault(customerId, minQty, maxQty) {
  return prisma.mslCustomerDefault.upsert({
    where: { customerId },
    update: { minQty, maxQty },
    create: { customerId, minQty, maxQty },
  });
}

async function deleteCustomerDefault(customerId) {
  return prisma.mslCustomerDefault.deleteMany({ where: { customerId } });
}

async function listCustomerDefaults() {
  return prisma.mslCustomerDefault.findMany({
    include: { customer: { select: { id: true, name: true, supplierCode: true } } },
    orderBy: { customer: { name: 'asc' } },
  });
}

// ── Part overrides ────────────────────────────────────────────────────────────

async function listPartOverrides({ customerId, search = '', page = 1, pageSize = 50 } = {}) {
  const where = {
    deletedAt: null,
    ...(customerId !== undefined ? { customerId: customerId === 'global' ? null : Number(customerId) } : {}),
    ...(search
      ? {
          OR: [
            { partNumber: { contains: search } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.mslPartOverride.findMany({
      where,
      orderBy: [{ partNumber: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mslPartOverride.count({ where }),
  ]);

  return { data, total };
}

async function getPartOverride(partNumber, customerId = null) {
  return prisma.mslPartOverride.findFirst({
    where: { partNumber, customerId: customerId ?? null, deletedAt: null },
  });
}

async function createPartOverride(data) {
  return prisma.mslPartOverride.create({ data });
}

async function updatePartOverride(id, data) {
  return prisma.mslPartOverride.update({ where: { id }, data });
}

async function softDeletePartOverride(id) {
  return prisma.mslPartOverride.update({ where: { id }, data: { deletedAt: new Date() } });
}

async function findPartOverrideById(id) {
  return prisma.mslPartOverride.findFirst({ where: { id, deletedAt: null } });
}

/**
 * Batch-fetch overrides for a list of part numbers + one customerId.
 * Used by mslService.resolveBatch() to avoid per-item queries.
 * Pass customerId=null to fetch global-scope overrides.
 */
async function getPartOverridesForParts(partNumbers, customerId = null) {
  if (!partNumbers || partNumbers.length === 0) return [];
  return prisma.mslPartOverride.findMany({
    where: {
      partNumber: { in: partNumbers },
      customerId: customerId ?? null,
      deletedAt: null,
    },
  });
}

async function upsertPartOverride({ partNumber, customerId, minQty, maxQty }) {
  const existing = await prisma.mslPartOverride.findFirst({
    where: { partNumber, customerId: customerId ?? null, deletedAt: null },
  });
  if (existing) {
    return prisma.mslPartOverride.update({
      where: { id: existing.id },
      data: { minQty, maxQty },
    });
  }
  return prisma.mslPartOverride.create({
    data: { partNumber, customerId: customerId ?? null, minQty, maxQty },
  });
}

module.exports = {
  getGlobalDefault,
  upsertGlobalDefault,
  getCustomerDefault,
  upsertCustomerDefault,
  deleteCustomerDefault,
  listCustomerDefaults,
  listPartOverrides,
  getPartOverride,
  getPartOverridesForParts,
  createPartOverride,
  updatePartOverride,
  softDeletePartOverride,
  findPartOverrideById,
  upsertPartOverride,
};
