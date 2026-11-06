/**
 * Webhook controller – WAHA incoming message handler.
 * Validates API key, dedupes by message id, routes to conversation service.
 */

const conversationService = require('../services/conversationService');
const settingsRepo = require('../repositories/settingsRepository');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../config/logger');

const wahaWebhook = asyncHandler(async (req, res) => {
  // Validate WAHA API key (from header or query)
  const incomingKey =
    req.headers['x-api-key'] ||
    req.headers['x-waha-key'] ||
    req.query.apiKey || '';

  const settings = await settingsRepo.getAllDecrypted();
  const configuredKey = settings.waha_api_key || '';

  if (configuredKey && incomingKey !== configuredKey) {
    logger.warn({ ip: req.ip }, 'WAHA webhook: invalid API key');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Respond immediately (WAHA expects fast response)
  res.status(200).json({ ok: true });

  // Process async
  const body = req.body;
  logger.debug({ event: body.event }, 'WAHA webhook received');

  try {
    // WAHA payload structure: { event, session, me, payload: { id, from, body, … } }
    if (body.event !== 'message' && body.event !== 'message.any') return;

    const msg = body.payload;
    if (!msg) return;

    const from = msg.from || msg.participant || '';
    const text = msg.body || msg.text || '';
    const waMessageId = msg.id || '';

    if (!from || !text) return;

    await conversationService.handleIncoming({
      from: from.replace('@c.us', ''),
      messageId: waMessageId,
      text,
      waMessageId,
    });
  } catch (e) {
    logger.error({ err: e }, 'WAHA webhook processing error');
  }
});

module.exports = { wahaWebhook };
