/**
 * Invoice controller – upload PDF, review items, apply to stock.
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const config = require('../config');
const invoiceService = require('../services/invoiceService');
const { success, paginated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, parseId } = require('../utils/errors');

// ── Multer (PDF only, 50 MB) ──────────────────────────────────────────────────
const tempDir = path.join(config.storage.root, 'uploads', '_temp');
fs.mkdirSync(tempDir, { recursive: true });

const upload = multer({
  dest: tempDir,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf') return cb(null, true);
    cb(new ValidationError('Only PDF invoices are supported'));
  },
});

// ── Handlers ──────────────────────────────────────────────────────────────────

/** POST /api/customers/:id/invoices/upload */
const uploadInvoice = [
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('No file uploaded');
    const customerId = parseId(req.params.id);
    const result = await invoiceService.uploadInvoice({
      customerId,
      tempFilePath: req.file.path,
      fileName:     req.file.originalname,
      userId:       req.user?.id,
    });
    success(res, result, 201);
  }),
];

/** POST /api/customers/:id/invoices/:invoiceId/apply */
const applyInvoice = asyncHandler(async (req, res) => {
  const invoiceId = parseId(req.params.invoiceId);
  const result = await invoiceService.applyInvoice(invoiceId, req.user?.id);
  success(res, result);
});

/** POST /api/customers/:id/invoices/:invoiceId/cancel */
const cancelInvoice = asyncHandler(async (req, res) => {
  const invoiceId = parseId(req.params.invoiceId);
  await invoiceService.cancelInvoice(invoiceId, req.user?.id);
  success(res, null);
});

/** GET /api/customers/:id/invoices */
const listInvoices = asyncHandler(async (req, res) => {
  const customerId = parseId(req.params.id);
  const { page = '1', pageSize = '50' } = req.query;
  const result = await invoiceService.listInvoices(customerId, {
    page:     parseInt(page, 10),
    pageSize: parseInt(pageSize, 10),
  });
  paginated(res, { ...result, page: parseInt(page, 10), pageSize: parseInt(pageSize, 10) });
});

/** GET /api/customers/:id/invoices/:invoiceId */
const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoice(parseId(req.params.invoiceId));
  success(res, invoice);
});

/** PATCH /api/customers/:id/invoices/:invoiceId — edit items of a pending invoice */
const updateInvoice = asyncHandler(async (req, res) => {
  const invoiceId = parseId(req.params.invoiceId);
  const { items } = req.body;
  if (!Array.isArray(items)) throw new ValidationError('items must be an array');
  const invoice = await invoiceService.updateInvoiceItems(invoiceId, items, req.user?.id);
  success(res, invoice);
});

module.exports = { uploadInvoice, applyInvoice, cancelInvoice, listInvoices, getInvoice, updateInvoice };
