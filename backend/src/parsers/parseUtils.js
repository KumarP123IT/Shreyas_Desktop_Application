/**
 * Shared parsing utilities used by PDF and Excel parsers.
 */

/**
 * Normalise a part number: trim whitespace, preserve exact format.
 * Accepts formats: 71109-06001-00, 83109-30005, 94220-00800
 */
function normalisePartNumber(raw) {
  if (!raw) return null;
  return String(raw).trim().replace(/\s+/g, '');
}

/**
 * Parse a quantity string to integer.
 * Returns null for non-numeric / empty values.
 */
function parseQty(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).replace(/,/g, '').trim();
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

/**
 * Parse forecast month string like "FEB-2027" or "FEBRUARY-2027" → "2027-02"
 */
function parseMonth(raw) {
  if (!raw) return null;
  const months = {
    JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,
    JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12,
    JANUARY:1,FEBRUARY:2,MARCH:3,APRIL:4,JUNE:6,
    JULY:7,AUGUST:8,SEPTEMBER:9,OCTOBER:10,NOVEMBER:11,DECEMBER:12,
  };
  const m = String(raw).toUpperCase().match(/([A-Z]+)[- ](\d{4})/);
  if (!m) return null;
  const mo = months[m[1]];
  if (!mo) return null;
  return `${m[2]}-${String(mo).padStart(2, '0')}`;
}

/**
 * Parse a sent date in dd-mm-yy or dd-mm-yyyy format → ISO string.
 */
function parseSentDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{1,2})[- \/](\d{1,2})[- \/](\d{2,4})/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  const dt = new Date(`${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

/**
 * Auto-detect supplier code from text (looks for S followed by 4 digits).
 */
function detectSupplierCode(text) {
  const m = text.match(/\bS\d{4}\b/);
  return m ? m[0] : null;
}

module.exports = { normalisePartNumber, parseQty, parseMonth, parseSentDate, detectSupplierCode };
