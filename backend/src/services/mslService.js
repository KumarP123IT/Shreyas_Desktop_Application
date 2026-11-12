/**
 * MSL service – resolver logic and CRUD for global/customer/part limits.
 * Priority: (1) part override → (2) customer default → (3) global default
 */

const mslRepo = require('../repositories/mslRepository');
const { ValidationError, NotFoundError } = require('../utils/errors');

// ── Resolution ────────────────────────────────────────────────────────────────

/**
 * Resolve effective min/max for a given part + customer combo.
 * Returns { min, max, source: 'part'|'customer'|'global'|null }
 * source===null means NOT_CONFIGURED.
 */
async function resolve(partNumber, customerId = null) {
  // 1) Part override (customer-specific first, then global part override)
  const customerPartOverride = customerId
    ? await mslRepo.getPartOverride(partNumber, customerId)
    : null;
  if (customerPartOverride) {
    return { min: customerPartOverride.minQty, max: customerPartOverride.maxQty, source: 'part' };
  }

  const globalPartOverride = await mslRepo.getPartOverride(partNumber, null);
  if (globalPartOverride) {
    return { min: globalPartOverride.minQty, max: globalPartOverride.maxQty, source: 'part' };
  }

  // 2) Customer default
  if (customerId) {
    const customerDefault = await mslRepo.getCustomerDefault(customerId);
    if (customerDefault) {
      return { min: customerDefault.minQty, max: customerDefault.maxQty, source: 'customer' };
    }
  }

  // 3) Global default
  const globalDefault = await mslRepo.getGlobalDefault();
  if (globalDefault) {
    return { min: globalDefault.minQty, max: globalDefault.maxQty, source: 'global' };
  }

  return { min: null, max: null, source: null };
}

/**
 * Compute MSL status for a quantity given a resolved range.
 */
function computeStatus(qty, resolved) {
  if (!resolved || resolved.source === null || resolved.min === null) return 'NOT_CONFIGURED';
  if (qty < resolved.min) return 'BELOW_MIN';
  if (qty > resolved.max) return 'ABOVE_MAX';
  return 'NORMAL';
}

// ── Global default CRUD ───────────────────────────────────────────────────────

async function getGlobalDefault() {
  return mslRepo.getGlobalDefault();
}

async function setGlobalDefault({ minQty, maxQty }) {
  validateRange(minQty, maxQty);
  return mslRepo.upsertGlobalDefault(minQty, maxQty);
}

// ── Customer default CRUD ─────────────────────────────────────────────────────

async function getCustomerDefault(customerId) {
  return mslRepo.getCustomerDefault(customerId);
}

async function setCustomerDefault(customerId, { minQty, maxQty }) {
  validateRange(minQty, maxQty);
  return mslRepo.upsertCustomerDefault(customerId, minQty, maxQty);
}

async function clearCustomerDefault(customerId) {
  return mslRepo.deleteCustomerDefault(customerId);
}

async function listCustomerDefaults() {
  return mslRepo.listCustomerDefaults();
}

// ── Part override CRUD ────────────────────────────────────────────────────────

async function listPartOverrides(query) {
  return mslRepo.listPartOverrides(query);
}

async function createPartOverride({ partNumber, customerId = null, minQty, maxQty }) {
  validateRange(minQty, maxQty);
  const existing = await mslRepo.getPartOverride(partNumber, customerId);
  if (existing) {
    throw new ValidationError(
      `A ${customerId ? 'customer' : 'global'} override for part "${partNumber}" already exists.`
    );
  }
  return mslRepo.createPartOverride({ partNumber, customerId, minQty, maxQty });
}

async function updatePartOverride(id, { minQty, maxQty }) {
  validateRange(minQty, maxQty);
  const existing = await mslRepo.findPartOverrideById(id);
  if (!existing) throw new NotFoundError('Part override');
  return mslRepo.updatePartOverride(id, { minQty, maxQty });
}

/**
 * Batch-resolve MSL ranges for multiple (partNumber, customerId) pairs.
 * Much more efficient than calling resolve() per item in a loop.
 * Returns a Map keyed by partNumber (string) with { min, max, source }.
 * When multiple customers are involved pass distinct calls or extend as needed;
 * here all items share the same customerId (one delivery = one customer).
 */
async function resolveBatch(partNumbers, customerId = null) {
  const unique = [...new Set(partNumbers)];
  const result = new Map();

  // Fetch all relevant data in 3 queries instead of 3N
  const [customerPartOverrides, globalPartOverrides, customerDefault, globalDefault] =
    await Promise.all([
      customerId
        ? mslRepo.getPartOverridesForParts(unique, customerId)
        : Promise.resolve([]),
      mslRepo.getPartOverridesForParts(unique, null),
      customerId ? mslRepo.getCustomerDefault(customerId) : Promise.resolve(null),
      mslRepo.getGlobalDefault(),
    ]);

  const custMap = new Map(customerPartOverrides.map((o) => [o.partNumber, o]));
  const globMap = new Map(globalPartOverrides.map((o) => [o.partNumber, o]));

  for (const partNumber of unique) {
    if (custMap.has(partNumber)) {
      const o = custMap.get(partNumber);
      result.set(partNumber, { min: o.minQty, max: o.maxQty, source: 'part' });
    } else if (globMap.has(partNumber)) {
      const o = globMap.get(partNumber);
      result.set(partNumber, { min: o.minQty, max: o.maxQty, source: 'part' });
    } else if (customerDefault) {
      result.set(partNumber, { min: customerDefault.minQty, max: customerDefault.maxQty, source: 'customer' });
    } else if (globalDefault) {
      result.set(partNumber, { min: globalDefault.minQty, max: globalDefault.maxQty, source: 'global' });
    } else {
      result.set(partNumber, { min: null, max: null, source: null });
    }
  }

  return result;
}

/**
 * Get a single part override by ID (used by controller for audit log 'before').
 */
async function getPartOverrideById(id) {
  return mslRepo.findPartOverrideById(id);
}

async function deletePartOverride(id) {
  const existing = await mslRepo.findPartOverrideById(id);
  if (!existing) throw new NotFoundError('Part override');
  return mslRepo.softDeletePartOverride(id);
}

/**
 * Bulk import part overrides from parsed rows.
 * rows: [{ partNumber, customerId?, minQty, maxQty }]
 * Returns { created, updated, skipped, errors }
 */
async function bulkImportPartOverrides(rows) {
  const results = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const [i, row] of rows.entries()) {
    try {
      if (!row.partNumber) throw new Error('Missing part number');
      validateRange(row.minQty, row.maxQty);
      const existing = await mslRepo.getPartOverride(row.partNumber, row.customerId ?? null);
      if (existing) {
        await mslRepo.updatePartOverride(existing.id, { minQty: row.minQty, maxQty: row.maxQty });
        results.updated++;
      } else {
        await mslRepo.createPartOverride({
          partNumber: row.partNumber,
          customerId: row.customerId ?? null,
          minQty: row.minQty,
          maxQty: row.maxQty,
        });
        results.created++;
      }
    } catch (err) {
      results.errors.push({ row: i + 1, partNumber: row.partNumber, message: err.message });
      results.skipped++;
    }
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateRange(minQty, maxQty) {
  if (!Number.isInteger(minQty) || minQty < 0) {
    throw new ValidationError('Min quantity must be a non-negative integer');
  }
  if (!Number.isInteger(maxQty) || maxQty < 0) {
    throw new ValidationError('Max quantity must be a non-negative integer');
  }
  if (maxQty <= minQty) {
    throw new ValidationError('Max quantity must be greater than Min quantity');
  }
}

module.exports = {
  resolve,
  resolveBatch,
  computeStatus,
  getGlobalDefault,
  setGlobalDefault,
  getCustomerDefault,
  setCustomerDefault,
  clearCustomerDefault,
  listCustomerDefaults,
  listPartOverrides,
  getPartOverrideById,
  createPartOverride,
  updatePartOverride,
  deletePartOverride,
  bulkImportPartOverrides,
};
