const reminderService = require('../services/reminderService');
const { success, paginated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError } = require('../utils/errors');

const list = asyncHandler(async (req, res) => {
  const { deliveryId, customerId, status, from, to, page = '1', pageSize = '50' } = req.query;
  const result = await reminderService.listReminders({
    deliveryId, customerId, status, from, to, page: parseInt(page), pageSize: parseInt(pageSize),
  });
  paginated(res, { ...result, page: parseInt(page), pageSize: parseInt(pageSize) });
});

const generate = asyncHandler(async (req, res) => {
  const deliveryId = parseInt(req.params.deliveryId);
  const result = await reminderService.generateReminders(deliveryId, req.user.id);
  success(res, result);
});

const restart = asyncHandler(async (req, res) => {
  const deliveryId = parseInt(req.params.deliveryId);
  const result = await reminderService.restartReminders(deliveryId, req.user.id);
  success(res, result);
});

const stop = asyncHandler(async (req, res) => {
  const { scope = 'delivery', deliveryItemId } = req.body;
  const deliveryId = parseInt(req.params.deliveryId);
  const result = await reminderService.stopReminders(deliveryId, scope, deliveryItemId ? parseInt(deliveryItemId) : null, req.user.id);
  success(res, result);
});

const clear = asyncHandler(async (req, res) => {
  const { deliveryId, customerId, status, from, to } = req.query;
  const result = await reminderService.clearReminders(
    { deliveryId, customerId, status, from, to }, req.user.id
  );
  success(res, result);
});

const snooze = asyncHandler(async (req, res) => {
  const { hours } = req.body;
  if (!hours || isNaN(hours)) throw new ValidationError('hours is required');
  const result = await reminderService.snoozeReminder(parseInt(req.params.id), parseFloat(hours), req.user.id);
  success(res, result);
});

const reschedule = asyncHandler(async (req, res) => {
  const { runAt } = req.body;
  if (!runAt) throw new ValidationError('runAt datetime is required');
  const result = await reminderService.rescheduleReminder(parseInt(req.params.id), runAt, req.user.id);
  success(res, result);
});

module.exports = { list, generate, restart, stop, clear, snooze, reschedule };
