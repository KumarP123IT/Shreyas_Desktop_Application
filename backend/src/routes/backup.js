const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const backupService = require('../services/backupService');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { ValidationError } = require('../utils/errors');
const config = require('../config');

const router = Router();
router.use(authenticate);

const BACKUP_DIR = path.join(config.storage.root, 'backups');

router.get('/',    asyncHandler(async (req, res) => {
  const data = await backupService.listBackups();
  success(res, data);
}));

router.post('/now', asyncHandler(async (req, res) => {
  const result = await backupService.runBackup();
  success(res, result);
}));

router.post('/restore', asyncHandler(async (req, res) => {
  const { filePath, confirm } = req.body;
  // Strong confirmation: user must type RESTORE exactly.
  if (confirm !== 'RESTORE') {
    throw new ValidationError('Type RESTORE in the confirm field to restore a backup');
  }
  if (!filePath) throw new ValidationError('filePath is required');
  const result = await backupService.restoreBackup(filePath);
  success(res, result);
}));

router.get('/download', asyncHandler(async (req, res) => {
  const { file } = req.query;
  if (!file) throw new ValidationError('file query param is required');
  // Path-traversal guard: resolved path must stay inside the backups dir.
  const resolved = path.resolve(BACKUP_DIR, path.basename(file));
  if (!resolved.startsWith(path.resolve(BACKUP_DIR)) || !fs.existsSync(resolved)) {
    throw new ValidationError('Backup file not found');
  }
  res.download(resolved, path.basename(file));
}));

module.exports = router;
