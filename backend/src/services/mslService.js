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
  computeStatus,
  getGlobalDefault,
  setGlobalDefault,
  getCustomerDefault,
  setCustomerDefault,
  clearCustomerDefault,
  listCustomerDefaults,
  listPartOverrides,
  createPartOverride,
  updatePartOverride,
  deletePartOverride,
  bulkImportPartOverrides,
};
