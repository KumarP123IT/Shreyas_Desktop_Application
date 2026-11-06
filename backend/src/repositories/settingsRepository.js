/**
 * App settings repository – encrypted secret handling.
 */

const prisma = require('../config/prisma');
const { encrypt, decrypt } = require('../utils/crypto');

const SECRET_KEYS = new Set([
  'smtp_pass', 'waha_api_key',
]);

// Values that must never overwrite a stored secret (masked placeholder echoed back).
const MASKED_VALUES = new Set(['••••••••', '[encrypted]', '********']);

async function get(key) {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return null;
  return row.isSecret ? decrypt(row.value) : row.value;
}

const MASK = '••••••••';

async function getAll() {
  const rows = await prisma.appSetting.findMany();
  const result = {};
  for (const row of rows) {
    // Secrets are never returned – masked placeholder only.
    result[row.key] = row.isSecret ? (row.value ? MASK : '') : row.value;
  }
  return result;
}

async function getAllDecrypted() {
  const rows = await prisma.appSetting.findMany();
  const result = {};
  for (const row of rows) {
    result[row.key] = row.isSecret ? decrypt(row.value) : row.value;
  }
  return result;
}

async function set(key, value) {
  const isSecret = SECRET_KEYS.has(key);
  // Ignore masked/placeholder echoes so secrets are never overwritten by GET output.
  if (isSecret && (value === undefined || value === null || MASKED_VALUES.has(String(value).trim()))) {
    return prisma.appSetting.findUnique({ where: { key } });
  }
  const stored = isSecret ? encrypt(value) : value;
  return prisma.appSetting.upsert({
    where: { key },
    update: { value: stored, isSecret },
    create: { key, value: stored, isSecret },
  });
}

async function setMany(pairs) {
  for (const [key, value] of Object.entries(pairs)) {
    await set(key, value);
  }
}

module.exports = { get, getAll, getAllDecrypted, set, setMany };
