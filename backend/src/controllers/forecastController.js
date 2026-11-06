const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const config = require('../config');
const forecastService = require('../services/forecastService');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError } = require('../utils/errors');

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

    // Return the temp path as a token (sanitised)
    success(res, {
      tempFileToken: path.basename(req.file.path),
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

  const tempFilePath = path.join(config.storage.root, 'uploads', '_temp', path.basename(tempFileToken));
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
  const forecastId = parseInt(req.params.id);

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

/** GET /api/forecasts – list by customer */
const listForecasts = asyncHandler(async (req, res) => {
  const { customerId } = req.query;
  if (!customerId) throw new ValidationError('customerId query param required');
  const forecasts = await forecastService.listForecasts(parseInt(customerId));
  success(res, forecasts);
});

/** GET /api/forecasts/:id/file – download original */
const downloadFile = asyncHandler(async (req, res) => {
  const forecast = await forecastService.getForecast(parseInt(req.params.id));
  if (!fs.existsSync(forecast.filePath)) {
    throw new ValidationError('Original file not found on disk');
  }
  res.download(forecast.filePath, forecast.fileName);
});

module.exports = { parsePreview, uploadFile, saveForecast, activateForecast, listForecasts, downloadFile };
