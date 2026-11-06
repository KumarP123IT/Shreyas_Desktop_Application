const notificationService = require('../services/notificationService');
const { success, paginated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const listLogs = asyncHandler(async (req, res) => {
  const { channel, customerId, status, from, to, page = '1', pageSize = '50' } = req.query;
  const result = await notificationService.listLogs({
    channel, customerId, status, from, to,
    page: parseInt(page), pageSize: parseInt(pageSize),
  });
  paginated(res, { ...result, page: parseInt(page), pageSize: parseInt(pageSize) });
});

const retry = asyncHandler(async (req, res) => {
  await notificationService.retryNotification(parseInt(req.params.id));
  success(res, { message: 'Queued for retry' });
});

const clearLogs = asyncHandler(async (req, res) => {
  const { channel, customerId, status, from, to } = req.query;
  const result = await notificationService.clearLogs(
    { channel, customerId, status, from, to }, req.user.id
  );
  success(res, result);
});

const internetStatus = asyncHandler(async (req, res) => {
  const online = await notificationService.checkInternet();
  success(res, { online });
});

module.exports = { listLogs, retry, clearLogs, internetStatus };
