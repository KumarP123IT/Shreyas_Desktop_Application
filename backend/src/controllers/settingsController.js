const settingsService = require('../services/settingsService');
const emailService = require('../services/emailService');
const baileysService = require('../services/baileysService');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError } = require('../utils/errors');
const logger = require('../config/logger');

const getAll = asyncHandler(async (req, res) => {
  const data = await settingsService.getPublic();
  success(res, data);
});

const update = asyncHandler(async (req, res) => {
  const data = await settingsService.update(req.body);
  success(res, data);
});

const testEmail = asyncHandler(async (req, res) => {
  const { to } = req.body;
  if (!to) throw new ValidationError('to email is required');
  await emailService.sendTestEmail(to);
  success(res, { message: `Test email sent to ${to}` });
});

const verifySmtp = asyncHandler(async (req, res) => {
  const result = await emailService.verifySmtp();
  success(res, result);
});

const wahaStatus = asyncHandler(async (req, res) => {
  const result = await baileysService.getSessionStatus();
  success(res, result);
});

const wahaQr = asyncHandler(async (req, res) => {
  const result = await baileysService.getQrCode();
  success(res, result);
});

const wahaPairingCode = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone) throw new ValidationError('phone number is required');
  const result = await baileysService.requestPairingCode(phone);
  success(res, result);
});

const testWhatsapp = asyncHandler(async (req, res) => {
  const { to } = req.body;
  if (!to) throw new ValidationError('to number is required');
  const result = await baileysService.sendTestMessage(to);
  success(res, { message: `Test message sent to ${to}`, result });
});

const wahaLogout = asyncHandler(async (req, res) => {
  await baileysService.logout();
  success(res, { message: 'Logged out — scan a new QR code to reconnect' });
});

module.exports = {
  getAll, update, testEmail, verifySmtp,
  wahaStatus, wahaQr, wahaPairingCode, testWhatsapp, wahaLogout,
};
