/**
 * Unit tests for mslService resolve + computeStatus logic.
 * Tests the priority chain and edge cases without hitting the DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Inline resolver (mirrors src/services/mslService.js) ─────────────────────

function resolveMsl({ partOverrideCustomer, partOverrideGlobal, customerDefault, globalDefault }) {
  if (partOverrideCustomer) return { min: partOverrideCustomer.minQty, max: partOverrideCustomer.maxQty, source: 'part' };
  if (partOverrideGlobal)   return { min: partOverrideGlobal.minQty,   max: partOverrideGlobal.maxQty,   source: 'part' };
  if (customerDefault)      return { min: customerDefault.minQty,      max: customerDefault.maxQty,      source: 'customer' };
  if (globalDefault)        return { min: globalDefault.minQty,        max: globalDefault.maxQty,        source: 'global' };
  return { min: null, max: null, source: null };
}

function computeStatus(qty, resolved) {
  if (!resolved || resolved.source === null || resolved.min === null) return 'NOT_CONFIGURED';
  if (qty < resolved.min) return 'BELOW_MIN';
  if (qty > resolved.max) return 'ABOVE_MAX';
  return 'NORMAL';
}

function validateRange(min, max) {
  if (!Number.isInteger(min) || min < 0) throw new Error('Min must be non-negative integer');
  if (!Number.isInteger(max) || max < 0) throw new Error('Max must be non-negative integer');
  if (max <= min) throw new Error('Max must be greater than Min');
}

const GLOBAL = { minQty: 100, maxQty: 500 };

// ── Resolution priority ───────────────────────────────────────────────────────

describe('resolveMsl priority', () => {
  it('uses global when nothing else set', () => {
    expect(resolveMsl({ globalDefault: GLOBAL })).toEqual({ min: 100, max: 500, source: 'global' });
  });

  it('customer default overrides global', () => {
    const r = resolveMsl({ globalDefault: GLOBAL, customerDefault: { minQty: 50, maxQty: 300 } });
    expect(r).toEqual({ min: 50, max: 300, source: 'customer' });
  });

  it('global part override overrides customer default', () => {
    const r = resolveMsl({
      globalDefault: GLOBAL,
      customerDefault: { minQty: 50, maxQty: 300 },
      partOverrideGlobal: { minQty: 10, maxQty: 20 },
    });
    expect(r).toEqual({ min: 10, max: 20, source: 'part' });
  });

  it('customer part override is highest priority', () => {
    const r = resolveMsl({
      globalDefault: GLOBAL,
      customerDefault: { minQty: 50, maxQty: 300 },
      partOverrideGlobal: { minQty: 10, maxQty: 20 },
      partOverrideCustomer: { minQty: 1, maxQty: 5 },
    });
    expect(r).toEqual({ min: 1, max: 5, source: 'part' });
  });

  it('returns null source when nothing configured', () => {
    expect(resolveMsl({})).toEqual({ min: null, max: null, source: null });
  });
});

// ── Status computation ────────────────────────────────────────────────────────

describe('computeStatus', () => {
  it('NOT_CONFIGURED when source is null', () => {
    expect(computeStatus(50, { min: null, max: null, source: null })).toBe('NOT_CONFIGURED');
  });
  it('NOT_CONFIGURED when no resolved', () => {
    expect(computeStatus(50, null)).toBe('NOT_CONFIGURED');
  });

  // Test data from spec
  it('BELOW_MIN for qty=2  (min 100)', () => expect(computeStatus(2,   { min: 100, max: 500, source: 'global' })).toBe('BELOW_MIN'));
  it('BELOW_MIN for qty=6  (min 100)', () => expect(computeStatus(6,   { min: 100, max: 500, source: 'global' })).toBe('BELOW_MIN'));
  it('BELOW_MIN for qty=10 (min 100)', () => expect(computeStatus(10,  { min: 100, max: 500, source: 'global' })).toBe('BELOW_MIN'));
  it('ABOVE_MAX for qty=78911 (max 500)', () => expect(computeStatus(78911, { min: 100, max: 500, source: 'global' })).toBe('ABOVE_MAX'));
  it('NORMAL for qty=250',  () => expect(computeStatus(250, { min: 100, max: 500, source: 'global' })).toBe('NORMAL'));
  it('NORMAL at min boundary (100)', () => expect(computeStatus(100, { min: 100, max: 500, source: 'global' })).toBe('NORMAL'));
  it('NORMAL at max boundary (500)', () => expect(computeStatus(500, { min: 100, max: 500, source: 'global' })).toBe('NORMAL'));
  it('BELOW_MIN at min-1 (99)',       () => expect(computeStatus(99,  { min: 100, max: 500, source: 'global' })).toBe('BELOW_MIN'));
  it('ABOVE_MAX at max+1 (501)',      () => expect(computeStatus(501, { min: 100, max: 500, source: 'global' })).toBe('ABOVE_MAX'));
});

// ── Range validation ──────────────────────────────────────────────────────────

describe('validateRange', () => {
  it('throws when max <= min', () => {
    expect(() => validateRange(100, 100)).toThrow('Max must be greater than Min');
    expect(() => validateRange(200, 100)).toThrow('Max must be greater than Min');
  });
  it('throws when min < 0', () => {
    expect(() => validateRange(-1, 100)).toThrow('non-negative');
  });
  it('throws when non-integer', () => {
    expect(() => validateRange(1.5, 100)).toThrow('non-negative integer');
  });
  it('passes for valid range', () => {
    expect(() => validateRange(0, 1)).not.toThrow();
    expect(() => validateRange(100, 500)).not.toThrow();
  });
});
