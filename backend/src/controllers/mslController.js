const { z } = require('zod');
const mslService = require('../services/mslService');
const prisma = require('../config/prisma');
const { success, paginated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { NotFoundError } = require('../utils/errors');

// ── Schemas ──────────────────────────────────────────────────────────────────

const rangeSchema = z.object({
  minQty: z.number().int().min(0),
  maxQty: z.number().int().min(1),
}).refine((d) => d.maxQty > d.minQty, { message: 'maxQty must be greater than minQty' });

const partOverrideSchema = z.object({
  partNumber: z.string().min(1).max(100),
  customerId: z.number().int().positive().optional().nullable(),
  minQty: z.number().int().min(0),
  maxQty: z.number().int().min(1),
}).refine((d) => d.maxQty > d.minQty, { message: 'maxQty must be greater than minQty' });

const bulkImportSchema = z.object({
  rows: z.array(
    z.object({
      partNumber: z.string().min(1),
      customerId: z.number().int().positive().optional().nullable(),
      minQty: z.number().int().min(0),
      maxQty: z.number().int().min(1),
    })
  ).min(1),
});

// ── Global default ────────────────────────────────────────────────────────────

const getGlobal = asyncHandler(async (req, res) => {
  const data = await mslService.getGlobalDefault();
  success(res, data);
});

const setGlobal = [
  validate(rangeSchema),
  asyncHandler(async (req, res) => {
    const data = await mslService.setGlobalDefault(req.body);
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        entityType: 'msl_global',
        entityId: 1,
        action: 'UPDATE',
        after: req.body,
      },
    });
    success(res, data);
  }),
];

// ── Customer defaults ─────────────────────────────────────────────────────────

const listCustomerDefaults = asyncHandler(async (req, res) => {
  const data = await mslService.listCustomerDefaults();
  success(res, data);
});

const getCustomerDefault = asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.id, 10);
  const data = await mslService.getCustomerDefault(customerId);
  success(res, data);
});

const setCustomerDefault = [
  validate(rangeSchema),
  asyncHandler(async (req, res) => {
    const customerId = parseInt(req.params.id, 10);
    const data = await mslService.setCustomerDefault(customerId, req.body);
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        customerId,
        entityType: 'msl_customer',
        entityId: customerId,
        action: 'UPDATE',
        after: req.body,
      },
    });
    success(res, data);
  }),
];

const clearCustomerDefault = asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.id, 10);
  const before = await mslService.getCustomerDefault(customerId);
  await mslService.clearCustomerDefault(customerId);
  await prisma.auditLog.create({
    data: {
      userId: req.user.id,
      customerId,
      entityType: 'msl_customer',
      entityId: customerId,
      action: 'DELETE',
      before,
    },
  });
  success(res, { message: 'Customer default cleared – will inherit global default' });
});

// ── Part overrides ────────────────────────────────────────────────────────────

const listOverrides = asyncHandler(async (req, res) => {
  const { customerId, search = '', page = '1', pageSize = '50' } = req.query;
  const result = await mslService.listPartOverrides({
    customerId,
    search,
    page: parseInt(page, 10),
    pageSize: parseInt(pageSize, 10),
  });
  paginated(res, { ...result, page: parseInt(page, 10), pageSize: parseInt(pageSize, 10) });
});

const createOverride = [
  validate(partOverrideSchema),
  asyncHandler(async (req, res) => {
    const data = await mslService.createPartOverride(req.body);
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        customerId: req.body.customerId ?? null,
        entityType: 'msl_part_override',
        entityId: data.id,
        action: 'CREATE',
        after: req.body,
      },
    });
    success(res, data, 201);
  }),
];

const updateOverride = [
  validate(rangeSchema),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const before = await mslService.listPartOverrides({ page: 1, pageSize: 1 });
    const data = await mslService.updatePartOverride(id, req.body);
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        entityType: 'msl_part_override',
        entityId: id,
        action: 'UPDATE',
        after: req.body,
      },
    });
    success(res, data);
  }),
];

const deleteOverride = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await mslService.deletePartOverride(id);
  await prisma.auditLog.create({
    data: {
      userId: req.user.id,
      entityType: 'msl_part_override',
      entityId: id,
      action: 'DELETE',
    },
  });
  success(res, { message: 'Override deleted' });
});

const bulkImport = [
  validate(bulkImportSchema),
  asyncHandler(async (req, res) => {
    const result = await mslService.bulkImportPartOverrides(req.body.rows);
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        entityType: 'msl_part_override',
        action: 'BULK_IMPORT',
        after: { count: req.body.rows.length, result },
      },
    });
    success(res, result);
  }),
];

// ── Resolver ──────────────────────────────────────────────────────────────────

const resolveRange = asyncHandler(async (req, res) => {
  const { customerId, partNo } = req.query;
  if (!partNo) {
    return success(res, { min: null, max: null, source: null });
  }
  const resolved = await mslService.resolve(partNo, customerId ? parseInt(customerId, 10) : null);
  success(res, resolved);
});

module.exports = {
  getGlobal, setGlobal,
  listCustomerDefaults, getCustomerDefault, setCustomerDefault, clearCustomerDefault,
  listOverrides, createOverride, updateOverride, deleteOverride, bulkImport,
  resolveRange,
};
