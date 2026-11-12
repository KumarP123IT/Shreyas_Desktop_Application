const reminderService = require('../services/reminderService');
const { success, paginated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, parseId } = require('../utils/errors');

const list = asyncHandler(async (req, res) => {
  const { deliveryId, customerId, status, from, to, page = '1', pageSize = '50' } = req.query;
  const result = await reminderService.listReminders({
    deliveryId, customerId, status, from, to,
    page: parseInt(page, 10),
    pageSize: Math.min(parseInt(pageSize, 10) || 50, 200),
  });
  paginated(res, { ...result, page: parseInt(page, 10), pageSize: parseInt(pageSize, 10) });
});

const generate = asyncHandler(async (req, res) => {
  const deliveryId = parseId(req.params.deliveryId, 'deliveryId');
  const result = await reminderService.generateReminders(deliveryId, req.user.id);
  success(res, {
    ...result,
    message: result.created > 0
      ? `${result.created} reminder${result.created !== 1 ? 's' : ''} scheduled (${result.skipped} skipped)`
      : `No new reminders scheduled (${result.skipped} skipped — already past or outside window)`,
  });
});

const restart = asyncHandler(async (req, res) => {
  const deliveryId = parseId(req.params.deliveryId, 'deliveryId');
  const result = await reminderService.restartReminders(deliveryId, req.user.id);
  success(res, {
    ...result,
    message: result.created > 0
      ? `${result.created} reminder${result.created !== 1 ? 's' : ''} rescheduled`
      : 'No reminders could be scheduled (dates may be in the past)',
  });
});

const stop = asyncHandler(async (req, res) => {
  const { scope = 'delivery', deliveryItemId } = req.body;
  const deliveryId = parseId(req.params.deliveryId, 'deliveryId');
  const result = await reminderService.stopReminders(
    deliveryId,
    scope,
    deliveryItemId ? parseId(deliveryItemId, 'deliveryItemId') : null,
    req.user.id,
  );
  success(res, result);
});

const clear = asyncHandler(async (req, res) => {
  const { deliveryId, customerId, status, from, to } = req.query;
  const result = await reminderService.clearReminders(
    { deliveryId, customerId, status, from, to }, req.user.id,
  );
  success(res, result);
});

const snooze = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const hours = parseFloat(req.body.hours);
  if (isNaN(hours) || hours <= 0) {
    throw new ValidationError('hours must be a positive number');
  }
  if (hours > 168) {
    throw new ValidationError('hours cannot exceed 168 (1 week)');
  }
  const result = await reminderService.snoozeReminder(id, hours, req.user.id);
  success(res, result);
});

const reschedule = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const { runAt } = req.body;
  if (!runAt) throw new ValidationError('runAt datetime is required');
  const result = await reminderService.rescheduleReminder(id, runAt, req.user.id);
  success(res, result);
});

module.exports = { list, generate, restart, stop, clear, snooze, reschedule };
