/**
 * Invoice PDF parser.
 * Extracts line items (part number, part name, qty) from a supplier invoice.
 * Uses the same text-extraction pipeline as pdfParser (pdf-parse → OCR fallback).
 * Returns { rows, meta, warnings, confidence }
 */

'use strict';

const { normalisePartNumber, parseQty, parseSentDate, detectSupplierCode } = require('./parseUtils');

// Re-use text extraction from pdfParser so we don't duplicate pdf-parse / OCR code
const { extractText } = require('./pdfParser');

/**
 * Main entry point. Returns:
 *  {
 *    rows:       [{ partNumber, partName, qty }],
 *    meta:       { invoiceNo, invoiceDate, supplierCode, customerName },
 *    warnings:   string[],
 *    confidence: 0..1,
 *    isOcr:      boolean,
 *  }
 */
async function parseInvoice(filePath) {
  const { text, isOcr } = await extractText(filePath);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const allText = lines.join(' ');

  // ── Meta extraction ───────────────────────────────────────────────────────
  const invoiceNoMatch = allText.match(/INV(?:OICE)?\s*(?:NO|NUMBER|#|NO\.)[:\s]*([A-Z0-9\-\/]+)/i);
  const invoiceNo = invoiceNoMatch ? invoiceNoMatch[1].trim() : null;

  const dateMatch = allText.match(
    /(?:DATE|DATED?)[:\s]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
  );
  const invoiceDate = dateMatch ? parseSentDate(dateMatch[1]) : null;

  const supplierCode = detectSupplierCode(allText) || null;

  let customerName = null;
  for (const line of lines) {
    if (line.length > 10 && /[A-Z]{3,}/.test(line) && !/(INVOICE|DATE|ADDRESS|BILL|TAX|GSTIN|PAN)/i.test(line)) {
      customerName = line;
      break;
    }
  }

  // ── Row extraction ────────────────────────────────────────────────────────
  const rows = [];
  const warnings = [];

  // Find the header row that contains part/item columns
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const u = lines[i].toUpperCase();
    if (
      (u.includes('PART') || u.includes('ITEM') || u.includes('DESCRIPTION')) &&
      (u.includes('QTY') || u.includes('QUANTITY'))
    ) {
      headerIdx = i;
      break;
    }
  }

  // Generic part-number pattern: 4-6 digits, dash, 4-6 digits, optional -NN
  const PART_RE = /\b(\d{4,6}-\d{4,6}(?:-\d{2})?)\b/;

  if (headerIdx !== -1) {
    // Parse structured table rows after the header
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(TOTAL|GRAND TOTAL|SUB.?TOTAL|AMOUNT)/i.test(line)) break;
      if (line.length < 5) continue;

      const partMatch = line.match(PART_RE);
      if (!partMatch) continue;

      const partNumber = normalisePartNumber(partMatch[1]);

      // Extract qty — look for the last standalone integer on the line
      // (invoice rows typically end: partNo | description | qty | rate | amount)
      const nums = line.replace(PART_RE, '').match(/\b(\d{1,6})\b/g) || [];
      // filter out the year / 4-digit codes that look like part fragments
      const candidates = nums.map(Number).filter((n) => n > 0 && n < 100000);
      const qty = candidates.length > 0 ? candidates[0] : null;

      if (!qty) {
        warnings.push(`Row ${i + 1}: found part ${partNumber} but could not read qty — "${line}"`);
        continue;
      }

      // Part name: text between the part number and the first digit after it
      const afterPart = line.slice(line.indexOf(partMatch[1]) + partMatch[1].length).trim();
      const nameEnd = afterPart.search(/\d/);
      const partName = nameEnd > 0 ? afterPart.slice(0, nameEnd).trim() : afterPart.split(/\s{2,}/)[0].trim();

      rows.push({ partNumber, partName: partName || partNumber, qty });
    }
  } else {
    // No header found — scan every line for a part-number pattern
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const partMatch = line.match(PART_RE);
      if (!partMatch) continue;

      const partNumber = normalisePartNumber(partMatch[1]);
      const nums = line.replace(PART_RE, '').match(/\b(\d{1,6})\b/g) || [];
      const candidates = nums.map(Number).filter((n) => n > 0 && n < 100000);
      const qty = candidates.length > 0 ? candidates[0] : null;

      if (!qty) {
        warnings.push(`Line ${i + 1}: found part ${partNumber} but no qty — "${line}"`);
        continue;
      }

      const afterPart = line.slice(line.indexOf(partMatch[1]) + partMatch[1].length).trim();
      const nameEnd = afterPart.search(/\d/);
      const partName = nameEnd > 0 ? afterPart.slice(0, nameEnd).trim() : afterPart.split(/\s{2,}/)[0].trim();

      rows.push({ partNumber, partName: partName || partNumber, qty });
    }

    if (rows.length === 0) {
      warnings.push('No table header found and no part numbers detected. The PDF layout may not be supported.');
    }
  }

  const confidence = rows.length > 0
    ? Math.max(0.4, 1 - warnings.length / Math.max(rows.length, 1))
    : 0;

  return {
    rows,
    meta: { invoiceNo, invoiceDate, supplierCode, customerName },
    warnings,
    confidence,
    isOcr,
  };
}

module.exports = { parseInvoice };
