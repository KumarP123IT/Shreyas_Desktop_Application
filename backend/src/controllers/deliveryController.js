const { z } = require('zod');
const deliveryService = require('../services/deliveryService');
const { success, paginated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { parseId, ValidationError } = require('../utils/errors');

const scheduleSchema = z.object({
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
}).refine((d) => {
  if (d.startDate && d.dueDate) return new Date(d.dueDate) >= new Date(d.startDate);
  return true;
}, { message: 'Due date must be on or after start date' });

const saveSheetSchema = z.object({
  items: z.array(z.object({
    partNumber: z.string().min(1),
    partName: z.string().min(1),
    totalQty: z.number().int().min(0),
    actualStock: z.number().int().min(0).optional().nullable(),
    extraColumns: z.record(z.unknown()).optional().nullable(),
  })).max(5000),
  columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    colType: z.string().optional(),
    width: z.number().optional(),
  })).optional(),
});

const markDeliveredSchema = z.object({
  scope: z.enum(['whole', 'material']).optional().default('whole'),
});

const list = asyncHandler(async (req, res) => {
  const { customerId, status, page = '1', pageSize = '20' } = req.query;
  const result = await deliveryService.listDeliveries({
    customerId, status,
    page: parseInt(page), pageSize: parseInt(pageSize),
  });
  paginated(res, { ...result, page: parseInt(page), pageSize: parseInt(pageSize) });
});

const getOne = asyncHandler(async (req, res) => {
  const delivery = await deliveryService.getDelivery(parseId(req.params.id));
  success(res, delivery);
});

const updateSchedule = [
  validate(scheduleSchema),
  asyncHandler(async (req, res) => {
    const d = await deliveryService.updateDeliverySchedule(parseId(req.params.id), req.body, req.user.id);
    success(res, d);
  }),
];

const saveSheet = [
  validate(saveSheetSchema),
  asyncHandler(async (req, res) => {
    const result = await deliveryService.saveSheet(parseId(req.params.id), req.body, req.user.id);
    success(res, result);
  }),
];

const reapplyDefaults = asyncHandler(async (req, res) => {
  const result = await deliveryService.reapplyDefaults(parseId(req.params.id), req.user.id);
  success(res, result);
});

const getMslSummary = asyncHandler(async (req, res) => {
  const summary = await deliveryService.getMslSummary(parseId(req.params.id));
  success(res, summary);
});

const getDashboardKpis = asyncHandler(async (req, res) => {
  const kpis = await deliveryService.getDashboardKpis();
  success(res, kpis);
});

const remove = asyncHandler(async (req, res) => {
  const result = await deliveryService.deleteDelivery(parseId(req.params.id), req.user.id);
  success(res, result);
});

const markDelivered = [
  validate(markDeliveredSchema),
  asyncHandler(async (req, res) => {
    const result = await deliveryService.markDelivered(
      parseId(req.params.id),
      { scope: req.body.scope },
      req.user.id,
    );
    success(res, result);
  }),
];

const cancel = asyncHandler(async (req, res) => {
  const result = await deliveryService.cancelDelivery(parseId(req.params.id), req.user.id);
  success(res, result);
});

module.exports = { list, getOne, updateSchedule, saveSheet, reapplyDefaults, getMslSummary, getDashboardKpis, remove, markDelivered, cancel };
