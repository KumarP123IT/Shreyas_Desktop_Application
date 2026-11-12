/**
 * Backup service – SQLite backups via VACUUM INTO (consistent snapshot,
 * includes WAL contents), keep last 14. Falls back to checkpoint+copy.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
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

// Millisecond-resolution timestamp — second resolution let two backups in
// the same second collide on the filename and fail VACUUM INTO.
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Run `prisma migrate deploy` against the (just-restored) database so a
 * backup taken before a migration doesn't leave the schema behind the code.
 * Uses the same direct-CLI approach as scripts/firstrun.js — no npx.
 */
function runMigrations() {
  const backendRoot = path.resolve(__dirname, '..', '..');
  const prismaCli   = path.join(backendRoot, 'node_modules', 'prisma', 'build', 'index.js');
  try {
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: backendRoot,
      stdio: 'pipe',
      env: process.env,
    });
  } catch (e) {
    const detail = e.stderr?.toString().trim() || e.message;
    throw new Error(`prisma migrate deploy failed: ${detail}`);
  }
}

/**
 * Run a backup by copying the SQLite database file.
 */
async function runBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const ts       = timestamp();
  const fileName = `backup_${ts}.db`;
  const filePath = path.join(BACKUP_DIR, fileName);
  const srcPath  = getDbFilePath();

  if (!fs.existsSync(srcPath)) {
    const err = `Database file not found: ${srcPath}`;
    await prisma.backupLog.create({ data: { filePath, status: 'failed', error: err } });
    return { ok: false, error: err };
  }

  try {
    // VACUUM INTO produces a transactionally-consistent snapshot (folds in
    // the WAL) without locking the live database the way a raw file copy can.
    const escaped = filePath.replace(/'/g, "''");
    try {
      await prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
    } catch (vacuumErr) {
      // Fallback for SQLite builds without VACUUM INTO
      logger.warn({ err: vacuumErr.message }, 'VACUUM INTO failed – falling back to file copy');
      // $queryRawUnsafe, not $executeRawUnsafe: PRAGMA wal_checkpoint returns
      // rows, which Prisma rejects on the execute path.
      await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
      fs.copyFileSync(srcPath, filePath);
    }

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
    } catch (err) {
      logger.warn({ err: err.message, filePath: log.filePath }, 'Could not prune old backup file');
    }
  }

  // Prune old pre-restore safety snapshots — keep the newest 5
  try {
    const preRestore = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('pre-restore_') && f.endsWith('.db'))
      .map((f) => ({ f, p: path.join(BACKUP_DIR, f), m: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    for (const old of preRestore.slice(5)) {
      try { fs.unlinkSync(old.p); } catch (err) {
        logger.warn({ err: err.message, filePath: old.p }, 'Could not prune pre-restore snapshot');
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not scan backup directory for pre-restore snapshots');
  }
}

/**
 * Restore from a backup (replaces current DB file).
 * Steps: integrity check → pre-restore snapshot → copy → reconnect.
 * Very destructive – only used when user explicitly requests it.
 */
async function restoreBackup(filePath) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(BACKUP_DIR)) || !fs.existsSync(resolved)) {
    throw new Error('Backup file not found or outside backup directory');
  }
  const destPath = getDbFilePath();

  // 1. Integrity check on the backup file using a temporary Prisma connection
  const { PrismaClient } = require('@prisma/client');
  const tempPrisma = new PrismaClient({
    // Prisma file: URLs need forward slashes on every platform (Windows too)
    datasources: { db: { url: `file:${resolved.replace(/\\/g, '/')}` } },
  });
  try {
    const rows = await tempPrisma.$queryRaw`PRAGMA integrity_check`;
    const result = rows?.[0]?.integrity_check;
    if (result !== 'ok') throw new Error(`Integrity check failed: ${result}`);
  } finally {
    await tempPrisma.$disconnect();
  }

  // 2. Take a safety snapshot of the current DB before overwriting
  const ts       = timestamp();
  const safetyPath = path.join(BACKUP_DIR, `pre-restore_${ts}.db`);
  if (fs.existsSync(destPath)) {
    fs.copyFileSync(destPath, safetyPath);
    logger.info({ safetyPath }, 'Pre-restore snapshot created');
  }

  // 3. Disconnect Prisma (release file lock on Windows), remove stale WAL/SHM
  // sidecars so an old journal isn't replayed onto the restored database,
  // then copy and reconnect.
  await prisma.$disconnect();
  try {
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = destPath + suffix;
      if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
    }
    fs.copyFileSync(resolved, destPath);
    logger.warn({ filePath, safetyPath }, 'Database restored from backup');
  } catch (e) {
    // Attempt rollback from safety snapshot
    if (fs.existsSync(safetyPath)) {
      fs.copyFileSync(safetyPath, destPath);
      logger.error({ err: e }, 'Restore failed — rolled back to pre-restore snapshot');
    }
    await prisma.$connect();
    throw e;
  }

  // A backup can predate migrations — bring the schema up to date before
  // reconnecting, otherwise every request fails (e.g. missing columns).
  // Runs while Prisma is still disconnected so nothing holds the file.
  try {
    runMigrations();
  } catch (migErr) {
    if (fs.existsSync(safetyPath)) {
      fs.copyFileSync(safetyPath, destPath);
      logger.error({ err: migErr }, 'Post-restore migration failed — rolled back to pre-restore snapshot');
    }
    await prisma.$connect();
    throw new Error(`Restore failed: post-restore migration error (${migErr.message}). Rolled back to the pre-restore snapshot.`);
  }

  await prisma.$connect();
  await pruneOldBackups().catch(() => {});
  return { ok: true, safetySnapshot: safetyPath };
}

module.exports = { runBackup, listBackups, restoreBackup };
