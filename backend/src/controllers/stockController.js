/**
 * Stock controller – global parts inventory management.
 */

const { z } = require('zod');
const stockService = require('../services/stockService');
const { success, paginated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { parseId } = require('../utils/errors');

// ── Validation schemas ────────────────────────────────────────────────────────

const createSchema = z.object({
  partNumber: z.string().min(1).max(100),
  partName:   z.string().min(1).max(255),
  quantity:   z.number().int().min(0).optional().default(0),
  unit:       z.string().max(50).optional().nullable(),
  notes:      z.string().max(500).optional().nullable(),
});

const updateSchema = z.object({
  partName: z.string().min(1).max(255).optional(),
  unit:     z.string().max(50).optional().nullable(),
  notes:    z.string().max(500).optional().nullable(),
});

const adjustSchema = z.object({
  quantity: z.number().int(),
  mode:     z.enum(['set', 'adjust']).default('adjust'),
  note:     z.string().max(500).optional().nullable(),
});

// ── Handlers ──────────────────────────────────────────────────────────────────

const list = asyncHandler(async (req, res) => {
  const { search = '', page = '1', pageSize = '50' } = req.query;
  const result = await stockService.listStocks({
    search,
    page:     parseInt(page, 10),
    pageSize: parseInt(pageSize, 10),
  });
  paginated(res, { ...result, page: parseInt(page, 10), pageSize: parseInt(pageSize, 10) });
});

const getOne = asyncHandler(async (req, res) => {
  const stock = await stockService.getStock(parseId(req.params.id));
  success(res, stock);
});

const create = [
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const stock = await stockService.createStock(req.body, req.user?.id);
    success(res, stock, 201);
  }),
];

const update = [
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const stock = await stockService.updateStock(parseId(req.params.id), req.body, req.user?.id);
    success(res, stock);
  }),
];

const adjust = [
  validate(adjustSchema),
  asyncHandler(async (req, res) => {
    const stock = await stockService.adjustStock(parseId(req.params.id), req.body, req.user?.id);
    success(res, stock);
  }),
];

const remove = asyncHandler(async (req, res) => {
  await stockService.deleteStock(parseId(req.params.id));
  success(res, null);
});

module.exports = { list, getOne, create, update, adjust, remove };
