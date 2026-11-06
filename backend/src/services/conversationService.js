/**
 * WhatsApp conversation state machine.
 * States: awaiting_action → awaiting_hours | awaiting_datetime | awaiting_scope
 *       → awaiting_confirm → [done]
 * Stored in WhatsappConversation table, expires in 30 min.
 */

const prisma = require('../config/prisma');
const reminderService = require('./reminderService');
const wahaService = require('./wahaService');
const settingsRepo = require('../repositories/settingsRepository');
const logger = require('../config/logger');
const { addHours, parseISO, isValid, isBefore, isAfter, addDays, startOfTomorrow } = require('date-fns');
const { fromZonedTime, toZonedTime } = require('date-fns-tz');

const TZ = 'Asia/Kolkata';
const EXPIRY_MINUTES = 30;
const MAX_RETRIES = 3;

// ── State machine ─────────────────────────────────────────────────────────────

async function handleIncoming({ from, messageId, text, waMessageId }) {
  // Idempotency: skip duplicate webhook
  const deduped = await prisma.whatsappConversation.findFirst({
    where: { lastMessageId: waMessageId || messageId, fromNumber: from },
  });
  if (deduped) {
    logger.info({ waMessageId }, 'Duplicate webhook – ignored');
    return;
  }

  // Validate sender is the configured number
  const settings = await settingsRepo.getAllDecrypted();
  const configuredNumber = (settings.recipient_whatsapp || '').replace(/\D/g, '');
  const incomingNumber = from.replace(/[^0-9]/g, '');
  if (configuredNumber && incomingNumber !== configuredNumber) {
    logger.warn({ from }, 'Message from unconfigured number – ignored');
    return;
  }

  const body = (text || '').trim();

  // Handle "cancel" at any state
  if (body.toLowerCase() === 'cancel') {
    await clearConversation(from);
    await wahaService.sendMessage(from, '✅ Conversation cancelled. You can reply to any reminder message to start again.');
    return;
  }

  // Find active conversation
  const conv = await prisma.whatsappConversation.findFirst({
    where: { fromNumber: from, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!conv) {
    // No active conversation – ignore or send help
    logger.info({ from }, 'No active conversation');
    return;
  }

  // Update last message id for dedup
  await prisma.whatsappConversation.update({
    where: { id: conv.id },
    data: { lastMessageId: waMessageId || messageId, updatedAt: new Date() },
  });

  const ctx = conv.contextJson;

  switch (conv.state) {
    case 'awaiting_action':
      return handleAction(conv, body, from, ctx);
    case 'awaiting_hours':
      return handleHours(conv, body, from, ctx);
    case 'awaiting_datetime':
      return handleDatetime(conv, body, from, ctx);
    case 'awaiting_scope':
      return handleScope(conv, body, from, ctx);
    case 'awaiting_confirm':
      return handleConfirm(conv, body, from, ctx);
    default:
      await clearConversation(from);
  }
}

async function handleAction(conv, body, from, ctx) {
  switch (body) {
    case '1':
      await updateConversation(conv.id, 'awaiting_hours', ctx);
      await wahaService.sendMessage(from,
        'How many hours until I should remind you?\nReply with: 1, 2, 4, 8, 24 or a custom number.\n(Type "cancel" to exit)');
      break;
    case '2':
      await updateConversation(conv.id, 'awaiting_datetime', ctx);
      await wahaService.sendMessage(from,
        'Reply with a date and time (e.g. "20-02-2027 10:30" or "tomorrow 10am").\n(Type "cancel" to exit)');
      break;
    case '3':
      await updateConversation(conv.id, 'awaiting_scope', ctx);
      await wahaService.sendMessage(from,
        'Mark as delivered:\n1 – This material only\n2 – Whole customer delivery\n(Type "cancel" to exit)');
      break;
    default:
      await rePrompt(conv, from, ctx, 'Please reply with 1, 2 or 3.');
  }
}

async function handleHours(conv, body, from, ctx) {
  const hours = parseFloat(body);
  if (isNaN(hours) || hours <= 0 || hours > 168) {
    return rePrompt(conv, from, ctx, 'Enter a number of hours (1–168). e.g. "4" for 4 hours.');
  }

  if (ctx.reminderId) {
    await reminderService.snoozeReminder(ctx.reminderId, hours, null);
  }

  const newTime = addHours(new Date(), hours);
  await auditAction('SNOOZE', ctx, { hours, newTime });
  await clearConversation(from);
  await wahaService.sendMessage(from, `✅ Got it! I'll remind you again in ${hours} hour${hours !== 1 ? 's' : ''}.\n(${newTime.toLocaleString('en-IN', { timeZone: TZ })})`);
}

async function handleDatetime(conv, body, from, ctx) {
  const dt = parseFlexibleDatetime(body);
  if (!dt) {
    return rePrompt(conv, from, ctx, 'Could not parse that date. Try "20-02-2027 10:30" or "tomorrow 10am".');
  }

  if (isBefore(dt, new Date())) {
    return rePrompt(conv, from, ctx, '❌ That date is in the past. Please enter a future date.');
  }

  // Validate within delivery window
  if (ctx.deliveryId) {
    const delivery = await prisma.delivery.findUnique({ where: { id: ctx.deliveryId } });
    if (delivery?.dueDate && isAfter(dt, new Date(delivery.dueDate))) {
      return rePrompt(conv, from, ctx, `❌ That date is after the delivery due date (${new Date(delivery.dueDate).toLocaleDateString('en-IN', { timeZone: TZ })}). Please pick an earlier time.`);
    }
  }

  // Store proposed datetime for confirmation
  const newCtx = { ...ctx, proposedDatetime: dt.toISOString() };
  await updateConversation(conv.id, 'awaiting_confirm', newCtx);
  await wahaService.sendMessage(from,
    `Reschedule reminder to ${dt.toLocaleString('en-IN', { timeZone: TZ })}?\nReply YES to confirm or cancel to exit.`);
}

async function handleScope(conv, body, from, ctx) {
  if (body !== '1' && body !== '2') {
    return rePrompt(conv, from, ctx, 'Reply 1 (this material only) or 2 (whole delivery).');
  }
  const scope = body === '1' ? 'material' : 'delivery';
  const newCtx = { ...ctx, scope };
  await updateConversation(conv.id, 'awaiting_confirm', newCtx);
  const scopeLabel = scope === 'material' ? 'this material only' : 'the whole delivery';
  await wahaService.sendMessage(from,
    `Mark as delivered for ${scopeLabel}?\nReply YES to confirm or cancel to exit.`);
}

async function handleConfirm(conv, body, from, ctx) {
  if (body.toUpperCase() !== 'YES') {
    await clearConversation(from);
    await wahaService.sendMessage(from, '❌ Cancelled. No changes made.');
    return;
  }

  if (ctx.proposedDatetime && ctx.reminderId) {
    // Reschedule
    await reminderService.rescheduleReminder(ctx.reminderId, ctx.proposedDatetime, null);
    await auditAction('RESCHEDULE', ctx, { newTime: ctx.proposedDatetime });
    await clearConversation(from);
    await wahaService.sendMessage(from, `✅ Reminder rescheduled to ${new Date(ctx.proposedDatetime).toLocaleString('en-IN', { timeZone: TZ })}.`);
  } else if (ctx.scope && ctx.deliveryId) {
    // Stop + mark delivered
    await reminderService.stopReminders(
      ctx.deliveryId,
      ctx.scope,
      ctx.scope === 'material' ? ctx.deliveryItemId : null,
      null
    );
    await auditAction('DELIVERED', ctx, { scope: ctx.scope });
    await clearConversation(from);
    await wahaService.sendMessage(from, `✅ Marked as delivered (${ctx.scope === 'material' ? 'this material' : 'whole delivery'}). No more reminders will be sent.`);
  }
}

// ── Conversation helpers ──────────────────────────────────────────────────────

async function startConversation(from, reminderId, deliveryId, deliveryItemId = null) {
  await clearConversation(from);
  return prisma.whatsappConversation.create({
    data: {
      fromNumber: from,
      state: 'awaiting_action',
      contextJson: { reminderId, deliveryId, deliveryItemId },
      expiresAt: new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000),
    },
  });
}

async function updateConversation(id, state, contextJson) {
  return prisma.whatsappConversation.update({
    where: { id },
    data: {
      state,
      contextJson,
      expiresAt: new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000),
    },
  });
}

async function clearConversation(from) {
  return prisma.whatsappConversation.updateMany({
    where: { fromNumber: from },
    data: { expiresAt: new Date(0) }, // expire immediately
  });
}

async function rePrompt(conv, from, ctx, message) {
  const retries = (ctx._retries || 0) + 1;
  if (retries >= MAX_RETRIES) {
    await clearConversation(from);
    await wahaService.sendMessage(from, '❌ Too many invalid replies. Conversation ended. Reply to a reminder to start again.');
    return;
  }
  await updateConversation(conv.id, conv.state, { ...ctx, _retries: retries });
  await wahaService.sendMessage(from, `${message}\n(${MAX_RETRIES - retries} attempt${MAX_RETRIES - retries !== 1 ? 's' : ''} remaining – type "cancel" to exit)`);
}

async function auditAction(action, ctx, data) {
  await prisma.auditLog.create({
    data: {
      entityType: 'whatsapp_conversation',
      entityId: ctx.deliveryId,
      action: `WHATSAPP_${action}`,
      after: { ...ctx, ...data },
    },
  });
}

// ── Flexible datetime parser ──────────────────────────────────────────────────

function parseFlexibleDatetime(text) {
  const s = text.trim().toLowerCase();

  // "tomorrow 10am" / "tomorrow 14:30"
  if (s.startsWith('tomorrow')) {
    const timeMatch = s.match(/(\d{1,2})[:\.]?(\d{2})?\s*(am|pm)?/);
    if (timeMatch) {
      let h = parseInt(timeMatch[1]);
      const m = parseInt(timeMatch[2] || '0');
      if (timeMatch[3] === 'pm' && h < 12) h += 12;
      if (timeMatch[3] === 'am' && h === 12) h = 0;
      const tomorrow = addDays(new Date(), 1);
      tomorrow.setHours(h, m, 0, 0);
      return fromZonedTime(tomorrow, TZ);
    }
    return null;
  }

  // "20-02-2027 10:30" or "20/02/2027 10:30"
  const match = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2})[:\.](\d{2})/);
  if (match) {
    const [, d, mo, y, h, min] = match;
    const localDate = new Date(
      parseInt(y),
      parseInt(mo) - 1,
      parseInt(d),
      parseInt(h),
      parseInt(min),
      0
    );
    return fromZonedTime(localDate, TZ);
  }

  // Try ISO-ish
  try {
    const dt = parseISO(text);
    if (isValid(dt)) return dt;
  } catch {}

  return null;
}

module.exports = { handleIncoming, startConversation, clearConversation };
