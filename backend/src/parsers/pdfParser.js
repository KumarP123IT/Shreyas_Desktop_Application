/**
 * PDF parser for customer forecast documents.
 * Uses pdf-parse for text-based PDFs.
 * Falls back to Tesseract OCR for scanned (image-based) PDFs.
 *
 * Adapter pattern: tries KTTM adapter first, falls back to generic table detection.
 */

const fs = require('fs');
const path = require('path');
const {
  normalisePartNumber,
  parseQty,
  parseMonth,
  parseSentDate,
  detectSupplierCode,
} = require('./parseUtils');

/**
 * Extract raw text from a PDF file.
 * Returns { text, pageTexts[], isOcr }
 */
async function extractText(filePath) {
  // Try pdf-parse first (works for text PDFs)
  try {
    const pdfParse = require('pdf-parse');
    const buf = fs.readFileSync(filePath);
    const data = await pdfParse(buf);

    // If the text looks meaningful (more than just whitespace)
    if (data.text && data.text.replace(/\s/g, '').length > 50) {
      return { text: data.text, isOcr: false };
    }
  } catch (e) {
    // Fall through to OCR
  }

  // Fallback: Tesseract OCR
  try {
    const Tesseract = require('tesseract.js');
    const { data } = await Tesseract.recognize(filePath, 'eng', {
      logger: () => {}, // suppress logs
    });
    return { text: data.text, isOcr: true };
  } catch (ocrErr) {
    throw new Error(`PDF text extraction failed: ${ocrErr.message}`);
  }
}

/**
 * Main PDF parse function.
 * Returns { rows, meta, warnings, needsReview, confidence, isOcr }
 */
async function parsePdf(filePath) {
  const { text, isOcr } = await extractText(filePath);

  // Try KTTM adapter first
  const kttmResult = tryKttmAdapter(text);
  if (kttmResult && kttmResult.rows.length > 0) {
    return { ...kttmResult, isOcr };
  }

  // Generic fallback
  const genericResult = tryGenericAdapter(text);
  return { ...genericResult, isOcr };
}

/**
 * Kirloskar Toyota Textile Machinery adapter.
 * Expects:
 *   Header: "KIRLOSKAR TOYOTA TEXTILE MACHINERY"
 *   Supplier Code: S0965, Forecast month: FEB-2027, Sent date: 05-11-26
 *   Columns: Supplier Code | Supplier Name | Part Number | Part Name | Total
 */
function tryKttmAdapter(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Detect this is a KTTM document
  const isKttm = lines.some(
    (l) => l.toUpperCase().includes('KIRLOSKAR TOYOTA') || l.toUpperCase().includes('KTTM')
  );
  if (!isKttm) return null;

  // Extract meta
  const allText = lines.join(' ');
  let supplierCode = detectSupplierCode(allText);
  if (!supplierCode) {
    // Concatenated header format: "Supplier CodeS0965" (no space)
    const scMatch = allText.match(/SUPPLIER\s*CODE\s*:?(S\d{3,6})/i);
    if (scMatch) supplierCode = scMatch[1];
  }
  if (!supplierCode) {
    // Fall back to the supplier code prefix on data rows (e.g. "S0965SHREYAS...")
    const rowMatch = lines.find((l) => /^S\d{3,6}[A-Z]/i.test(l));
    if (rowMatch) supplierCode = rowMatch.match(/^(S\d{3,6})/i)[1];
  }
  supplierCode = supplierCode || 'S0965';
  const monthMatch = allText.match(/FORECAST\s+FOR\s+THE\s+MONTH\s+OF\s+([A-Z]+-\d{4})/i);
  const forecastMonth = parseMonth(monthMatch ? monthMatch[1] : null);
  const sentMatch = allText.match(/SENT\s*DATE\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
  const sentDate = parseSentDate(sentMatch ? sentMatch[1] : null);

  // Detect customer name (first non-empty line that looks like a company name)
  let customerName = null;
  for (const line of lines) {
    if (line.length > 10 && /[A-Z]{3,}/.test(line) && !line.includes('FORECAST') && !line.includes('SUPPLIER')) {
      customerName = line;
      break;
    }
  }

  const rows = [];
  const warnings = [];
  const needsReview = [];

  // Find table header row
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toUpperCase();
    if (
      (l.includes('PART NUMBER') || l.includes('PART NO')) &&
      (l.includes('TOTAL') || l.includes('QTY'))
    ) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) return null;

  // Parse data rows after header
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];

    // Stop at footer markers
    if (/total|grand total|subtotal/i.test(line) && /^\s*(total)/i.test(line)) break;
    // Skip non-data lines (forecast month banner, page footers, etc.)
    if (/FORECAST\s+FOR\s+THE\s+MONTH/i.test(line)) continue;
    if (line.length < 5) continue;

    const parsed = parseKttmRow(line);
    if (!parsed) {
      // Try multi-line: sometimes part name spans 2 lines
      needsReview.push({ lineNo: i + 1, raw: line, reason: 'Could not parse row' });
      continue;
    }

    if (!parsed.partNumber) {
      needsReview.push({ lineNo: i + 1, raw: line, reason: 'Missing part number' });
      continue;
    }

    if (parsed.totalQty === null) {
      warnings.push({ lineNo: i + 1, partNumber: parsed.partNumber, reason: 'Non-numeric total' });
      parsed.totalQty = 0;
    }

    rows.push(parsed);
  }

  // Check for duplicate part numbers
  const seen = new Map();
  rows.forEach((r, idx) => {
    if (seen.has(r.partNumber)) {
      warnings.push({
        partNumber: r.partNumber,
        reason: `Duplicate part number at row ${idx + 1} (first seen at row ${seen.get(r.partNumber) + 1})`,
      });
    }
    seen.set(r.partNumber, idx);
  });

  const confidence = rows.length > 0 ? Math.min(1, rows.length / Math.max(1, rows.length + needsReview.length)) : 0;

  return {
    rows,
    meta: {
      customerName,
      supplierCode,
      forecastMonth,
      sentDate,
      adapterUsed: 'kttm',
    },
    warnings,
    needsReview,
    confidence,
  };
}

/**
 * Parse a single KTTM table row.
 * Format: [SupplierCode] [SupplierName] [PartNumber] [PartName...] [Total]
 */
function parseKttmRow(line) {
  // Split on 2+ spaces (column separator in pdfparse output)
  const parts = line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);

  if (parts.length >= 3) {
    // Spaced-column layout
    let partNumberIdx = -1;
    for (let i = 0; i < parts.length; i++) {
      if (/^\d{4,6}-\d{4,6}(-\d{2})?$/.test(parts[i])) {
        partNumberIdx = i;
        break;
      }
    }

    if (partNumberIdx === -1) return null;

    const partNumber = normalisePartNumber(parts[partNumberIdx]);

    // Everything after partNumber except the last token is the part name
    const nameParts = parts.slice(partNumberIdx + 1, parts.length - 1);
    const partName = nameParts.join(' ').trim() || 'UNKNOWN';

    // Last token is Total
    const totalRaw = parts[parts.length - 1];
    const totalQty = parseQty(totalRaw);

    return { partNumber, partName, totalQty };
  }

  // Concatenated layout: "S0965SHREYAS INDUSTRIAL FASTENERS71109-06001-00SCREW,STUD330"
  // Columns have no whitespace separators, so locate the part number by pattern.
  const pnMatch = line.match(/\d{4,6}-\d{4,6}(?:-\d{2})?/);
  if (!pnMatch) return null;

  const partNumber = normalisePartNumber(pnMatch[0]);
  const afterPn = line.slice(pnMatch.index + pnMatch[0].length);

  // Trailing run of digits is the Total; everything before it is the part name.
  const qtyMatch = afterPn.match(/(\d+)\s*$/);
  const totalQty = qtyMatch ? parseQty(qtyMatch[1]) : null;
  const partName = (qtyMatch ? afterPn.slice(0, qtyMatch.index) : afterPn).trim() || 'UNKNOWN';

  return { partNumber, partName, totalQty };
}

/**
 * Generic table-detection fallback.
 * Looks for any table-like structure with a numeric last column.
 */
function tryGenericAdapter(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows = [];
  const warnings = [];
  const needsReview = [];
  const allText = lines.join(' ');

  const supplierCode = detectSupplierCode(allText);
  const forecastMonth = parseMonth(allText.match(/([A-Z]+-\d{4})/)?.[1]);
  const sentDate = parseSentDate(allText.match(/SENT\s*DATE[:\s]+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i)?.[1]);

  for (const line of lines) {
    if (line.length < 10) continue;
    // Look for lines with a part-number-like token and a number at the end
    const partMatch = line.match(/(\d{4,6}-\d{4,6}(-\d{2})?)/);
    if (!partMatch) continue;

    const partNumber = normalisePartNumber(partMatch[1]);
    const numMatch = line.match(/(\d+)\s*$/);
    const totalQty = numMatch ? parseInt(numMatch[1], 10) : null;
    const partName = line
      .replace(partMatch[0], '')
      .replace(numMatch ? numMatch[0] : '', '')
      .replace(/\s{2,}/g, ' ')
      .trim() || 'UNKNOWN';

    if (!totalQty) {
      needsReview.push({ raw: line, reason: 'No numeric total found' });
      continue;
    }

    rows.push({ partNumber, partName, totalQty });
  }

  return {
    rows,
    meta: {
      customerName: null,
      supplierCode,
      forecastMonth,
      sentDate,
      adapterUsed: 'generic',
    },
    warnings,
    needsReview,
    confidence: rows.length > 10 ? 0.6 : 0.3,
  };
}

module.exports = { parsePdf };
