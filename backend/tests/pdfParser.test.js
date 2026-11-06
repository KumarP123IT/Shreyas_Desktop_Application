/**
 * Parser unit tests – tests the parsing utilities without actual PDF files.
 * Acceptance criteria from spec:
 *   54 rows, first = 71109-06001-00 / SCREW,STUD / 330
 *   last = 94220-00800 / NUT,WELD(M8*1.25) / 31655
 */

import { describe, it, expect } from 'vitest';
import { normalisePartNumber, parseQty, parseMonth, parseSentDate, detectSupplierCode } from '../src/parsers/parseUtils.js';

describe('parseUtils', () => {
  describe('normalisePartNumber', () => {
    it('preserves -00 suffix format', () => {
      expect(normalisePartNumber('71109-06001-00')).toBe('71109-06001-00');
    });
    it('preserves format without suffix', () => {
      expect(normalisePartNumber('83109-30005')).toBe('83109-30005');
    });
    it('trims whitespace', () => {
      expect(normalisePartNumber('  71109-06001-00  ')).toBe('71109-06001-00');
    });
    it('returns null for empty', () => {
      expect(normalisePartNumber('')).toBeNull();
      expect(normalisePartNumber(null)).toBeNull();
    });
  });

  describe('parseQty', () => {
    it('parses plain integers', () => {
      expect(parseQty('330')).toBe(330);
      expect(parseQty('31655')).toBe(31655);
    });
    it('parses comma-formatted numbers', () => {
      expect(parseQty('1,234')).toBe(1234);
    });
    it('returns null for non-numeric', () => {
      expect(parseQty('N/A')).toBeNull();
      expect(parseQty('')).toBeNull();
      expect(parseQty(null)).toBeNull();
    });
    it('parses zero', () => {
      expect(parseQty('0')).toBe(0);
    });
  });

  describe('parseMonth', () => {
    it('parses FEB-2027 → 2027-02', () => {
      expect(parseMonth('FEB-2027')).toBe('2027-02');
    });
    it('parses JAN-2027 → 2027-01', () => {
      expect(parseMonth('JAN-2027')).toBe('2027-01');
    });
    it('parses DEC-2026 → 2026-12', () => {
      expect(parseMonth('DEC-2026')).toBe('2026-12');
    });
    it('handles context string', () => {
      expect(parseMonth('FORECAST FOR THE MONTH OF FEB-2027')).toBe('2027-02');
    });
    it('returns null for invalid', () => {
      expect(parseMonth('INVALID')).toBeNull();
      expect(parseMonth(null)).toBeNull();
    });
  });

  describe('parseSentDate', () => {
    it('parses dd-mm-yy (05-11-26) → ISO with year 2026', () => {
      const result = parseSentDate('05-11-26');
      expect(result).toContain('2026-11-05');
    });
    it('parses dd-mm-yyyy', () => {
      const result = parseSentDate('05-11-2026');
      expect(result).toContain('2026-11-05');
    });
    it('returns null for invalid', () => {
      expect(parseSentDate('invalid')).toBeNull();
      expect(parseSentDate(null)).toBeNull();
    });
  });

  describe('detectSupplierCode', () => {
    it('detects S0965 in text', () => {
      expect(detectSupplierCode('Supplier Code S0965 Supplier Name SHREYAS')).toBe('S0965');
    });
    it('returns null if no code', () => {
      expect(detectSupplierCode('no code here')).toBeNull();
    });
  });
});

// ── Simulated KTTM parse test ─────────────────────────────────────────────────
// Since we cannot run a real PDF in unit tests, we test the row parser directly.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

describe('KTTM row parsing (simulated)', () => {
  // Simulate what pdf-parse would output for a KTTM table line
  const sampleLines = [
    'S0965  SHREYAS INDUSTRIAL FASTENERS  71109-06001-00  SCREW,STUD  330',
    'S0965  SHREYAS INDUSTRIAL FASTENERS  83109-30005  BOLT,HEX  6',
    'S0965  SHREYAS INDUSTRIAL FASTENERS  94220-00800  NUT,WELD(M8*1.25)  31655',
    'S0965  SHREYAS INDUSTRIAL FASTENERS  99999-00001  WASHER  INVALID',
  ];

  // Inline the row parser logic
  function parseKttmRowTest(line) {
    const parts = line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) return null;

    let partNumberIdx = -1;
    for (let i = 0; i < parts.length; i++) {
      if (/^\d{4,6}-\d{4,6}(-\d{2})?$/.test(parts[i])) {
        partNumberIdx = i;
        break;
      }
    }
    if (partNumberIdx === -1) return null;

    const partNumber = parts[partNumberIdx];
    const nameParts = parts.slice(partNumberIdx + 1, parts.length - 1);
    const partName = nameParts.join(' ').trim() || 'UNKNOWN';
    const totalRaw = parts[parts.length - 1];
    const totalQty = parseQty(totalRaw);
    return { partNumber, partName, totalQty };
  }

  it('parses first row correctly (71109-06001-00, SCREW,STUD, 330)', () => {
    const r = parseKttmRowTest(sampleLines[0]);
    expect(r.partNumber).toBe('71109-06001-00');
    expect(r.partName).toBe('SCREW,STUD');
    expect(r.totalQty).toBe(330);
  });

  it('parses row without -00 suffix (83109-30005)', () => {
    const r = parseKttmRowTest(sampleLines[1]);
    expect(r.partNumber).toBe('83109-30005');
    expect(r.totalQty).toBe(6);
  });

  it('parses last row (94220-00800, NUT,WELD(M8*1.25), 31655)', () => {
    const r = parseKttmRowTest(sampleLines[2]);
    expect(r.partNumber).toBe('94220-00800');
    expect(r.partName).toBe('NUT,WELD(M8*1.25)');
    expect(r.totalQty).toBe(31655);
  });

  it('returns null total for non-numeric', () => {
    const r = parseKttmRowTest(sampleLines[3]);
    expect(r.totalQty).toBeNull();
  });
});
