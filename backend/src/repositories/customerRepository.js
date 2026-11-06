/**
 * Customer repository – all DB access for Customer entity.
 */

const prisma = require('../config/prisma');

async function findAll({ search = '', includeArchived = false, page = 1, pageSize = 20 } = {}) {
  const where = {
    deletedAt: includeArchived ? undefined : null,
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { supplierCode: { contains: search } },
            { contactName: { contains: search } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        mslDefault: true,
        _count: { select: { deliveries: { where: { deletedAt: null } } } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return { data, total };
}

async function findById(id) {
  return prisma.customer.findFirst({
    where: { id, deletedAt: null },
    include: {
      mslDefault: true,
      _count: { select: { deliveries: { where: { deletedAt: null } } } },
    },
  });
}

async function findBySupplierCode(supplierCode, excludeId = null) {
  return prisma.customer.findFirst({
    where: {
      supplierCode,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
}

async function create(data) {
  return prisma.customer.create({ data });
}

async function update(id, data) {
  return prisma.customer.update({ where: { id }, data });
}

async function softDelete(id) {
  return prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
}

async function restore(id) {
  return prisma.customer.update({ where: { id }, data: { deletedAt: null } });
}

module.exports = { findAll, findById, findBySupplierCode, create, update, softDelete, restore };
