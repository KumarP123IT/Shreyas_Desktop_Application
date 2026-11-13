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

  // Customer name: prefer the company listed under "Billed to"
  let customerName = null;
  const billedIdx = lines.findIndex((l) => /billed\s*to/i.test(l));
  if (billedIdx !== -1) {
    for (let i = billedIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/shipped\s*to|gstin|invoice|s\.?n\.?/i.test(l)) break;
      if (l.length > 3) { customerName = l.split(/\s{2,}/)[0].trim(); break; }
    }
  }
  if (!customerName) {
    for (const line of lines) {
      if (line.length > 10 && /[A-Z]{3,}/.test(line) && !/(INVOICE|DATE|ADDRESS|BILL|TAX|GSTIN|PAN)/i.test(line)) {
        customerName = line;
        break;
      }
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

      const parsed = extractInvoiceRow(line, PART_RE);
      if (!parsed) continue;

      if (!parsed.qty) {
        warnings.push(`Row ${i + 1}: found part ${parsed.partNumber} but could not read qty — "${line}"`);
        continue;
      }

      rows.push(parsed);
    }
  } else {
    // No header found — scan every line for a part-number pattern
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parsed = extractInvoiceRow(line, PART_RE);
      if (!parsed) continue;

      if (!parsed.qty) {
        warnings.push(`Line ${i + 1}: found part ${parsed.partNumber} but no qty — "${line}"`);
        continue;
      }

      rows.push(parsed);
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

/**
 * Extract one invoice line: part number, part name, qty.
 *
 * GST invoice layout (SIF-style):
 *   "1.71301-04002-00 Nut Hex 5T W/Plating   73181110  100.00Nos.  1.440  144.000"
 *   S.N | Description | HSN(8) | Qty | Unit | Price | Amount
 *
 * Rules:
 *  - strip a leading "N." serial prefix so it isn't mistaken for qty
 *  - part name = text between part number and the 8-digit HSN/SAC code
 *  - qty = the number immediately before the unit token (Nos./Pcs/Kg/M/Box…)
 *  - fallback: first plausible number after the HSN when no unit is found
 */
function extractInvoiceRow(line, PART_RE) {
  const clean = line.replace(/^\s*\d+\.\s*/, ''); // drop "1." serial prefix
  const partMatch = clean.match(PART_RE);
  if (!partMatch) return null;

  const partNumber = normalisePartNumber(partMatch[1]);
  const afterPart  = clean.slice(clean.indexOf(partMatch[1]) + partMatch[1].length);

  // HSN/SAC is an 8-digit code right after the description
  const hsnMatch = afterPart.match(/\d{8}/);
  const namePart = hsnMatch ? afterPart.slice(0, hsnMatch.index) : afterPart;
  const qtyPart  = hsnMatch ? afterPart.slice(hsnMatch.index + hsnMatch[0].length) : afterPart;

  // Qty = number directly before the unit token
  const UNIT_RE = /([\d,]+(?:\.\d+)?)\s*(?:Nos?|Pcs?|PCS|Kg|Kgs|Gms?|M|Metres?|Box|Unit|LTR|Litres?)\b/i;
  const unitMatch = qtyPart.match(UNIT_RE);
  let qty = unitMatch ? parseQty(unitMatch[1]) : null;

  // Fallback: first number in the qty region (after HSN, before rate/amount)
  if (qty == null) {
    const nums = qtyPart.match(/\d[\d,]*(?:\.\d+)?/g) || [];
    for (const n of nums) {
      const v = parseQty(n);
      if (v != null && v > 0 && v < 1000000) { qty = v; break; }
    }
  }

  const partName = namePart.replace(/\s{2,}/g, ' ').trim() || partNumber;
  return { partNumber, partName, qty };
}

module.exports = { parseInvoice };
