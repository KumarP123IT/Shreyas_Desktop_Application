/**
 * SQLite stores JSON as TEXT. These helpers encode/decode transparently.
 * Usage:
 *   - Before writing:  jsonField.encode(value)    → null | stringified JSON
 *   - After reading:   jsonField.decode(rawValue)  → parsed value | null
 *   - To decode a whole Prisma result: jsonField.decodeFields(record, ['reminderOffsets','parseWarnings'])
 */

/**
 * Encode a value for storage in a SQLite text field.
 * Passes null/undefined through unchanged.
 */
function encode(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    // Already a JSON string (idempotent)
    try { JSON.parse(value); return value; } catch (_) { /* fall through */ }
  }
  return JSON.stringify(value);
}

/**
 * Decode a stored text value back to a JS value.
 * Returns null if the input is null/undefined or cannot be parsed.
 */
function decode(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return raw; // already parsed
  try { return JSON.parse(raw); } catch (_) { return null; }
}

/**
 * Decode multiple named fields on a plain object (mutates a shallow copy).
 * Returns the copy so you can use it as: const d = decodeFields(delivery, ['reminderOffsets'])
 */
function decodeFields(record, fields) {
  if (!record) return record;
  const copy = { ...record };
  for (const f of fields) {
    if (f in copy) copy[f] = decode(copy[f]);
  }
  return copy;
}

module.exports = { encode, decode, decodeFields };
