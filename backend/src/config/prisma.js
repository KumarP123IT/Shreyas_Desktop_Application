/**
 * Singleton Prisma client — SQLite edition.
 *
 * Adds a middleware layer that transparently handles JSON serialisation:
 *   • Before write (create/update/upsert): encodes any known JSON fields to strings
 *   • After read: decodes those strings back to objects
 *
 * This means the rest of the application can continue using plain JS objects
 * for these fields, identical to the original MySQL behaviour.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

// ── JSON field registry ───────────────────────────────────────────────────────
// Maps model name → array of fields that are stored as JSON strings in SQLite.
const JSON_FIELDS = {
  Customer:              ['reminderOffsets'],
  Delivery:              ['reminderOffsets'],
  Forecast:              ['parseWarnings'],
  DeliveryItem:          ['extraColumns'],
  NotificationOutbox:    ['metadata'],
  WhatsappConversation:  ['contextJson'],
  AuditLog:              ['before', 'after'],
};

function encodeJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value; // already stringified
  return JSON.stringify(value);
}

function decodeJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value; // already an object
  try { return JSON.parse(value); } catch (_) { return null; }
}

function applyEncoding(model, data) {
  const fields = JSON_FIELDS[model];
  if (!fields || !data || typeof data !== 'object') return data;
  const result = { ...data };
  for (const f of fields) {
    if (f in result) result[f] = encodeJson(result[f]);
  }
  return result;
}

function applyDecoding(model, record) {
  const fields = JSON_FIELDS[model];
  if (!fields || !record || typeof record !== 'object') return record;
  if (Array.isArray(record)) return record.map((r) => applyDecoding(model, r));
  const result = { ...record };
  for (const f of fields) {
    if (f in result) result[f] = decodeJson(result[f]);
  }
  return result;
}

// ── Prisma client ─────────────────────────────────────────────────────────────
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

prisma.$on('error', (e) => logger.error({ source: 'prisma' }, e.message));
prisma.$on('warn',  (e) => logger.warn({ source: 'prisma' }, e.message));

// ── Middleware ────────────────────────────────────────────────────────────────
prisma.$use(async (params, next) => {
  const model = params.model;

  // Encode JSON fields before writes
  if (['create', 'update', 'upsert'].includes(params.action)) {
    if (params.args?.data) {
      params.args.data = applyEncoding(model, params.args.data);
    }
    // upsert has separate create / update objects
    if (params.action === 'upsert') {
      if (params.args?.create) params.args.create = applyEncoding(model, params.args.create);
      if (params.args?.update) params.args.update = applyEncoding(model, params.args.update);
    }
  }

  // createMany — encode each item
  if (params.action === 'createMany' && Array.isArray(params.args?.data)) {
    params.args.data = params.args.data.map((item) => applyEncoding(model, item));
  }

  const result = await next(params);

  // Decode JSON fields after reads
  if (result) {
    if (['findFirst', 'findUnique', 'findUniqueOrThrow',
         'create', 'update', 'upsert', 'findFirstOrThrow'].includes(params.action)) {
      return applyDecoding(model, result);
    }
    if (['findMany'].includes(params.action) && Array.isArray(result)) {
      return result.map((r) => applyDecoding(model, r));
    }
  }
  return result;
});

module.exports = prisma;
