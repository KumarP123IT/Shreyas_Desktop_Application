/**
 * Webhooks router.
 * The old WAHA webhook (/waha) has been removed — incoming WhatsApp messages
 * are now handled in-process by baileysService.js via its messages.upsert event.
 *
 * This file is kept as a placeholder so the router registration in routes/index.js
 * doesn't need to change. Future webhooks (e.g. email delivery receipts) go here.
 */

const { Router } = require('express');
const router = Router();

// No active webhook routes at this time.

module.exports = router;
