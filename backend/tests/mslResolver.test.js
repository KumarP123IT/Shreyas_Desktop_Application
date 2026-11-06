/**
 * Unit tests for MSL resolution logic.
 * Tests the priority chain: part override → customer default → global default.
 */

import { describe, it, expect } from 'vitest';

// ── MSL resolver (inline – will be extracted to src in Phase 2) ──────────────

/**
 * Resolve effective min/max for a part.
 * Priority: (1) part override → (2) customer default → (3) global default
 */
function resolveMsl({ globalDefault, customerDefault, partOverride }) {
  if (partOverride) {
    return { min: partOverride.minQty, max: partOverride.maxQty, source: 'part' };
  }
  if (customerDefault) {
    return { min: customerDefault.minQty, max: customerDefault.maxQty, source: 'customer' };
  }
  if (globalDefault) {
    return { min: globalDefault.minQty, max: globalDefault.maxQty, source: 'global' };
  }
  return null; // NOT_CONFIGURED
}

/**
 * Compute MSL status for a given quantity and resolved range.
 */
function computeMslStatus(qty, resolved) {
  if (!resolved) return 'NOT_CONFIGURED';
  if (qty < resolved.min) return 'BELOW_MIN';
  if (qty > resolved.max) return 'ABOVE_MAX';
  return 'NORMAL';
}

// ── Tests ────────────────────────────────────────────────────────────────────

const GLOBAL = { minQty: 100, maxQty: 500 };

describe('resolveMsl', () => {
  it('uses global default when nothing else is set', () => {
    const result = resolveMsl({ globalDefault: GLOBAL });
    expect(result).toEqual({ min: 100, max: 500, source: 'global' });
  });

  it('prefers customer default over global', () => {
    const result = resolveMsl({
      globalDefault: GLOBAL,
      customerDefault: { minQty: 50, maxQty: 300 },
    });
    expect(result).toEqual({ min: 50, max: 300, source: 'customer' });
  });

  it('prefers part override over everything', () => {
    const result = resolveMsl({
      globalDefault: GLOBAL,
      customerDefault: { minQty: 50, maxQty: 300 },
      partOverride: { minQty: 10, maxQty: 20 },
    });
    expect(result).toEqual({ min: 10, max: 20, source: 'part' });
  });

  it('returns null when nothing is configured', () => {
    const result = resolveMsl({});
    expect(result).toBeNull();
  });
});

describe('computeMslStatus', () => {
  it('returns NOT_CONFIGURED when no resolved range', () => {
    expect(computeMslStatus(50, null)).toBe('NOT_CONFIGURED');
  });

  it('returns BELOW_MIN for qty=2 with global default (min 100)', () => {
    expect(computeMslStatus(2, { min: 100, max: 500 })).toBe('BELOW_MIN');
  });

  it('returns BELOW_MIN for qty=6', () => {
    expect(computeMslStatus(6, { min: 100, max: 500 })).toBe('BELOW_MIN');
  });

  it('returns BELOW_MIN for qty=10', () => {
    expect(computeMslStatus(10, { min: 100, max: 500 })).toBe('BELOW_MIN');
  });

  it('returns ABOVE_MAX for qty=78911', () => {
    expect(computeMslStatus(78911, { min: 100, max: 500 })).toBe('ABOVE_MAX');
  });

  it('returns NORMAL for qty=250 (within 100-500)', () => {
    expect(computeMslStatus(250, { min: 100, max: 500 })).toBe('NORMAL');
  });

  it('returns NORMAL for boundary values', () => {
    expect(computeMslStatus(100, { min: 100, max: 500 })).toBe('NORMAL');
    expect(computeMslStatus(500, { min: 100, max: 500 })).toBe('NORMAL');
  });
});
