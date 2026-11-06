const { z } = require('zod');
const customerService = require('../services/customerService');
const { success, paginated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');

// ── Schemas ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(200),
  supplierCode: z.string().min(1).max(50),
  contactName: z.string().max(150).optional().nullable(),
  contactEmail: z.string().email().optional().nullable().or(z.literal('')),
  contactWhatsapp: z.string().max(30).optional().nullable(),
  notes: z.string().optional().nullable(),
  notifyWhatsapp: z.boolean().default(true),
  notifyEmail: z.boolean().default(true),
  recipientEmail: z.string().email().optional().nullable().or(z.literal('')),
  recipientWhatsapp: z.string().max(30).optional().nullable(),
  reminderOffsets: z.array(z.number().int().positive()).optional().default([10, 5, 3, 1]),
  qtyCheckMode: z.enum(['forecast', 'actual']).optional().default('forecast'),
});

const updateSchema = createSchema.partial();

// ── Handlers ─────────────────────────────────────────────────────────────────

const list = asyncHandler(async (req, res) => {
  const { page = '1', pageSize = '20', search = '', includeArchived = 'false' } = req.query;
  const result = await customerService.listCustomers({
    page: parseInt(page, 10),
    pageSize: parseInt(pageSize, 10),
    search,
    includeArchived: includeArchived === 'true',
  });
  paginated(res, { ...result, page: parseInt(page, 10), pageSize: parseInt(pageSize, 10) });
});

const getOne = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomer(parseInt(req.params.id, 10));
  success(res, customer);
});

const create = [
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const customer = await customerService.createCustomer(req.body, req.user.id);
    success(res, customer, 201);
  }),
];

const update = [
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const customer = await customerService.updateCustomer(
      parseInt(req.params.id, 10),
      req.body,
      req.user.id
    );
    success(res, customer);
  }),
];

const archive = asyncHandler(async (req, res) => {
  await customerService.archiveCustomer(parseInt(req.params.id, 10), req.user.id);
  success(res, { message: 'Customer archived' });
});

const restore = asyncHandler(async (req, res) => {
  await customerService.restoreCustomer(parseInt(req.params.id, 10), req.user.id);
  success(res, { message: 'Customer restored' });
});

module.exports = { list, getOne, create, update, archive, restore };
