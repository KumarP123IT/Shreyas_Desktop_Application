/**
 * Backup service – SQLite file copy to /storage/backups, keep last 14.
 * Replaces the old mysqldump approach. Uses fs.copyFile which works
 * on Windows without any external tools.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const prisma  = require('../config/prisma');
const config  = require('../config');
const logger  = require('../config/logger');

const BACKUP_DIR  = path.join(config.storage.root, 'backups');
const KEEP_BACKUPS = 14;

/**
 * Resolve the SQLite database file path from DATABASE_URL.
 * Handles both  file:./path  and  file:/absolute/path  formats.
 */
function getDbFilePath() {
  const url = (process.env.DATABASE_URL || '').replace(/^file:/, '');
  return path.resolve(path.dirname(require.resolve('../../package.json')), url);
}

/**
 * Run a backup by copying the SQLite database file.
 */
async function runBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `backup_${ts}.db`;
  const filePath = path.join(BACKUP_DIR, fileName);
  const srcPath  = getDbFilePath();

  if (!fs.existsSync(srcPath)) {
    const err = `Database file not found: ${srcPath}`;
    await prisma.backupLog.create({ data: { filePath, status: 'failed', error: err } });
    return { ok: false, error: err };
  }

  try {
    // SQLite WAL checkpoint before copy for consistency
    await prisma.$executeRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(srcPath, filePath);

    const sizeBytes = fs.statSync(filePath).size;
    await prisma.backupLog.create({ data: { filePath, sizeBytes, status: 'success' } });
    await pruneOldBackups();

    logger.info({ filePath, sizeBytes }, 'Backup completed');
    return { ok: true, filePath, sizeBytes };
  } catch (e) {
    await prisma.backupLog.create({ data: { filePath, status: 'failed', error: e.message } });
    logger.error({ err: e }, 'Backup failed');
    return { ok: false, error: e.message };
  }
}

/**
 * List recent backups.
 */
async function listBackups() {
  const rows = await prisma.backupLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return rows.map((r) => ({ ...r, sizeBytes: r.sizeBytes != null ? Number(r.sizeBytes) : null }));
}

/**
 * Prune old backups, keeping only the last KEEP_BACKUPS successful ones.
 */
async function pruneOldBackups() {
  const logs = await prisma.backupLog.findMany({
    where: { status: 'success' },
    orderBy: { createdAt: 'desc' },
  });
  for (const log of logs.slice(KEEP_BACKUPS)) {
    try {
      if (fs.existsSync(log.filePath)) fs.unlinkSync(log.filePath);
      await prisma.backupLog.delete({ where: { id: log.id } });
    } catch (_) { /* ignore */ }
  }
}

/**
 * Restore from a backup (replaces current DB file).
 * Very destructive – only used when user explicitly requests it.
 */
async function restoreBackup(filePath) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(BACKUP_DIR)) || !fs.existsSync(resolved)) {
    throw new Error('Backup file not found or outside backup directory');
  }
  const destPath = getDbFilePath();
  // Disconnect Prisma so the file is not locked on Windows
  await prisma.$disconnect();
  fs.copyFileSync(resolved, destPath);
  logger.warn({ filePath }, 'Database restored from backup');
  // Reconnect
  await prisma.$connect();
  return { ok: true };
}

module.exports = { runBackup, listBackups, restoreBackup };
