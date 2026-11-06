/**
 * Excel (.xlsx) parser for customer forecasts.
 * Uses ExcelJS. Performs automatic column mapping when headers differ.
 */

const ExcelJS = require('exceljs');
const {
  normalisePartNumber,
  parseQty,
  parseMonth,
  parseSentDate,
  detectSupplierCode,
} = require('./parseUtils');

// Canonical column names and their aliases
const COLUMN_MAP = {
  partNumber: ['part number', 'part no', 'part no.', 'partno', 'part_number', 'partnumber', 'part#'],
  partName:   ['part name', 'description', 'part desc', 'item name', 'material', 'part_name'],
  total:      ['total', 'qty', 'quantity', 'total qty', 'total quantity', 'forecast', 'forecast total'],
  supplierCode: ['supplier code', 'supplier_code', 'supp code'],
  supplierName: ['supplier name', 'supplier_name'],
};

/**
 * Main Excel parse function.
 * Returns { rows, meta, warnings, needsReview, confidence }
 */
async function parseExcel(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('No worksheets found in the Excel file');

  const allRows = [];
  worksheet.eachRow((row, rowNum) => {
    allRows.push({ rowNum, values: row.values.slice(1) }); // slice(1) removes 1-indexed offset
  });

  if (allRows.length === 0) throw new Error('Excel file is empty');

  // Extract meta from the first few rows
  const headerRows = allRows.slice(0, 10).map((r) => r.values.join(' '));
  const allHeaderText = headerRows.join(' ');
  const supplierCode = detectSupplierCode(allHeaderText);
  const forecastMonth = parseMonth(allHeaderText.match(/([A-Z]+-\d{4})/)?.[1]);
  const sentDate = parseSentDate(allHeaderText.match(/SENT\s*DATE[:\s]+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i)?.[1]);

  // Find the column mapping row (first row with "part number"-like header)
  let headerRowIdx = -1;
  let colMapping = null;

  for (let i = 0; i < Math.min(allRows.length, 15); i++) {
    const mapping = detectColumnMapping(allRows[i].values);
    if (mapping && mapping.partNumber !== -1) {
      headerRowIdx = i;
      colMapping = mapping;
      break;
    }
  }

  if (!colMapping) {
    return {
      rows: [],
      meta: { supplierCode, forecastMonth, sentDate, adapterUsed: 'excel-generic' },
      warnings: [{ reason: 'Could not detect column headers. Please map columns manually.' }],
      needsReview: [],
      confidence: 0,
    };
  }

  const rows = [];
  const warnings = [];
  const needsReview = [];
  const seen = new Map();

  for (let i = headerRowIdx + 1; i < allRows.length; i++) {
    const vals = allRows[i].values;
    if (!vals || vals.every((v) => !v)) continue; // skip empty rows

    const partNumberRaw = vals[colMapping.partNumber];
    const partNameRaw   = vals[colMapping.partName];
    const totalRaw      = vals[colMapping.total];

    const partNumber = normalisePartNumber(partNumberRaw);
    if (!partNumber) {
      needsReview.push({ rowNum: allRows[i].rowNum, raw: vals.join(' | '), reason: 'Missing part number' });
      continue;
    }

    const partName = partNameRaw ? String(partNameRaw).trim() : 'UNKNOWN';
    const totalQty = parseQty(totalRaw);

    if (totalQty === null) {
      warnings.push({ rowNum: allRows[i].rowNum, partNumber, reason: 'Non-numeric or missing total' });
    }

    if (seen.has(partNumber)) {
      warnings.push({ rowNum: allRows[i].rowNum, partNumber, reason: 'Duplicate part number' });
    }
    seen.set(partNumber, allRows[i].rowNum);

    rows.push({ partNumber, partName, totalQty: totalQty ?? 0 });
  }

  const confidence = rows.length > 0 ? Math.min(1, rows.length / (rows.length + needsReview.length)) : 0;

  return {
    rows,
    meta: { supplierCode, forecastMonth, sentDate, adapterUsed: 'excel' },
    warnings,
    needsReview,
    confidence,
  };
}

/**
 * Detect column indices from a header row.
 */
function detectColumnMapping(values) {
  const result = { partNumber: -1, partName: -1, total: -1 };
  values.forEach((val, idx) => {
    if (!val) return;
    const v = String(val).toLowerCase().trim();
    if (COLUMN_MAP.partNumber.includes(v) && result.partNumber === -1) result.partNumber = idx;
    if (COLUMN_MAP.partName.includes(v)   && result.partName === -1)   result.partName = idx;
    if (COLUMN_MAP.total.includes(v)      && result.total === -1)       result.total = idx;
  });
  // Need at least partNumber and total
  if (result.partNumber === -1 || result.total === -1) return null;
  return result;
}

module.exports = { parseExcel, detectColumnMapping };
