const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const forecastService = require('../services/forecastService');
const { success, paginated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, parseId } = require('../utils/errors');

// ── Temp-file token helpers ───────────────────────────────────────────────────
// The token is HMAC-signed so a user cannot guess or steal another user's
// upload token. Format: "<basename>.<hmac-hex>"

const TOKEN_SECRET = config.jwt.secret; // reuse JWT secret — both are per-install

function signToken(basename, userId) {
  return `${basename}.${crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${basename}:${userId}`)
    .digest('hex')}`;
}

function verifyToken(token, userId) {
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx === -1) return null;
  const basename = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expected = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${basename}:${userId}`)
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  return basename;
}

// ── Multer config (temp upload) ───────────────────────────────────────────────
const tempDir = path.join(config.storage.root, 'uploads', '_temp');
fs.mkdirSync(tempDir, { recursive: true });

const upload = multer({
  dest: tempDir,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new ValidationError('Only PDF and Excel files are allowed'));
  },
});

// ── Handlers ──────────────────────────────────────────────────────────────────

/** POST /api/forecasts/parse – step 1: parse-only, returns preview */
const parsePreview = [
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('No file uploaded');

    const fileType = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    const result = await forecastService.parseFile(req.file.path, fileType);

    // Clean up temp file
    fs.unlink(req.file.path, () => {});

    success(res, result);
  }),
];

/** POST /api/forecasts/upload – step 1: upload and keep temp file, return token */
const uploadFile = [
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('No file uploaded');

    const fileType = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    const result = await forecastService.parseFile(req.file.path, fileType);

    // Token is HMAC-signed with userId so another user cannot claim this upload
    const token = signToken(path.basename(req.file.path), req.user.id);
    success(res, {
      tempFileToken: token,
      fileName: req.file.originalname,
      fileType,
      ...result,
    });
  }),
];

/** POST /api/forecasts/save – step 2: save after user review */
const saveForecast = asyncHandler(async (req, res) => {
  const { customerId, tempFileToken, fileName, fileType, rows, startDate, dueDate } = req.body;

  if (!customerId) throw new ValidationError('customerId is required');
  if (!tempFileToken) throw new ValidationError('tempFileToken is required');
  if (!rows || !Array.isArray(rows)) throw new ValidationError('rows array is required');
  if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError('At least one row is required');
  if (rows.length > 5000) throw new ValidationError('Too many rows (max 5000)');

  // Verify HMAC signature — ensures the token was issued to this user
  const basename = verifyToken(tempFileToken, req.user.id);
  if (!basename) throw new ValidationError('Invalid or expired upload token. Please upload again.');

  const tempFilePath = path.join(config.storage.root, 'uploads', '_temp', path.basename(basename));
  if (!fs.existsSync(tempFilePath)) {
    throw new ValidationError('Uploaded file has expired. Please upload again.');
  }

  const { forecast, meta } = await forecastService.saveForecast({
    customerId: parseInt(customerId),
    tempFilePath,
    fileName,
    fileType,
    parsedData: {
      rows,
      meta: req.body.meta || {},
      warnings: req.body.warnings || [],
      needsReview: req.body.needsReview || [],
      confidence: req.body.confidence || 1,
    },
    userId: req.user.id,
  });

  success(res, { forecast, meta, warnings: req.body.warnings || [], needsReview: req.body.needsReview || [] }, 201);
});

/** POST /api/forecasts/:id/activate – step 3 */
const activateForecast = asyncHandler(async (req, res) => {
  const { rows, startDate, dueDate } = req.body;
  const forecastId = parseId(req.params.id);

  if (!rows || !Array.isArray(rows)) throw new ValidationError('rows array is required');

  const delivery = await forecastService.activateForecast({
    forecastId,
    rows,
    startDate,
    dueDate,
    userId: req.user.id,
  });

  success(res, delivery, 201);
});

/** GET /api/forecasts – list by customer, paginated */
const listForecasts = asyncHandler(async (req, res) => {
  const { customerId, page = '1', pageSize = '50' } = req.query;
  if (!customerId) throw new ValidationError('customerId query param required');
  const pg   = parseInt(page, 10) || 1;
  const size = Math.min(parseInt(pageSize, 10) || 50, 200);
  const result = await forecastService.listForecasts(parseId(customerId, 'customerId'), { page: pg, pageSize: size });
  paginated(res, { ...result, page: pg, pageSize: size });
});

/** GET /api/forecasts/:id/file – download original */
const downloadFile = asyncHandler(async (req, res) => {
  const forecast = await forecastService.getForecast(parseId(req.params.id));
  if (!fs.existsSync(forecast.filePath)) {
    throw new ValidationError('Original file not found on disk');
  }
  res.download(forecast.filePath, forecast.fileName);
});

module.exports = { parsePreview, uploadFile, saveForecast, activateForecast, listForecasts, downloadFile };
