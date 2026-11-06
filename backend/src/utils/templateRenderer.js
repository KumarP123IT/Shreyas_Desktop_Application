/**
 * Simple template renderer.
 * Replaces {{placeholder}} tokens in message templates.
 */

const { format } = require('date-fns');
const { toZonedTime } = require('date-fns-tz');

const TZ = 'Asia/Kolkata';

function formatDateIST(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return format(toZonedTime(d, TZ), 'dd MMM yyyy');
}

/**
 * Render a template string with data tokens.
 * @param {string} template  - contains {{token}} placeholders
 * @param {object} data      - key-value pairs
 */
function render(template, data = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key];
    if (val === undefined || val === null) return '—';
    if (val instanceof Date) return formatDateIST(val);
    return String(val);
  });
}

/**
 * Build reminder data tokens for a delivery + item.
 */
function buildReminderTokens({ delivery, item, daysLeft }) {
  return {
    customerName: delivery.customer?.name || '—',
    customer:     delivery.customer?.name || '—',
    part:         item?.partName || '—',
    partName:     item?.partName || '—',
    partNo:       item?.partNumber || '—',
    partNumber:   item?.partNumber || '—',
    total:        String(item?.totalQty ?? '—'),
    totalQty:     String(item?.totalQty ?? '—'),
    min:          String(item?.snapshotMinQty ?? '—'),
    minQty:       String(item?.snapshotMinQty ?? '—'),
    max:          String(item?.snapshotMaxQty ?? '—'),
    maxQty:       String(item?.snapshotMaxQty ?? '—'),
    dueDate:      formatDateIST(delivery.dueDate),
    daysLeft:     String(daysLeft ?? '—'),
    forecastMonth: delivery.forecastMonth || '—',
    supplierCode:  delivery.customer?.supplierCode || '—',
  };
}

module.exports = { render, buildReminderTokens, formatDateIST };
