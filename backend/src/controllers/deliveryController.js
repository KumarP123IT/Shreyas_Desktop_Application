const { z } = require('zod');
const deliveryService = require('../services/deliveryService');
const { success, paginated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');

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
  })),
  columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    colType: z.string().optional(),
    width: z.number().optional(),
  })).optional(),
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
  const delivery = await deliveryService.getDelivery(parseInt(req.params.id));
  success(res, delivery);
});

const updateSchedule = [
  validate(scheduleSchema),
  asyncHandler(async (req, res) => {
    const d = await deliveryService.updateDeliverySchedule(parseInt(req.params.id), req.body, req.user.id);
    success(res, d);
  }),
];

const saveSheet = [
  validate(saveSheetSchema),
  asyncHandler(async (req, res) => {
    const result = await deliveryService.saveSheet(parseInt(req.params.id), req.body, req.user.id);
    success(res, result);
  }),
];

const reapplyDefaults = asyncHandler(async (req, res) => {
  const result = await deliveryService.reapplyDefaults(parseInt(req.params.id), req.user.id);
  success(res, result);
});

const getMslSummary = asyncHandler(async (req, res) => {
  const summary = await deliveryService.getMslSummary(parseInt(req.params.id));
  success(res, summary);
});

const getDashboardKpis = asyncHandler(async (req, res) => {
  const kpis = await deliveryService.getDashboardKpis();
  success(res, kpis);
});

const remove = asyncHandler(async (req, res) => {
  const result = await deliveryService.deleteDelivery(parseInt(req.params.id), req.user.id);
  success(res, result);
});

module.exports = { list, getOne, updateSchedule, saveSheet, reapplyDefaults, getMslSummary, getDashboardKpis, remove };
