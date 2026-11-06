/**
 * Baileys WhatsApp Service
 * ─────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for wahaService.js.
 * Uses @whiskeysockets/baileys — pure Node.js, no Docker, no Chromium.
 *
 * Exported API (same shape as the old wahaService):
 *   sendMessage(to, text)   → sends a WhatsApp text message
 *   getSessionStatus()      → { ok, status }
 *   getQrCode()             → { ok, qr: 'data:image/png;base64,…' }
 *   sendTestMessage(to)     → shorthand for sendMessage
 *   startClient()           → called once at server startup
 *   stopClient()            → graceful shutdown
 *
 * QR codes are also emitted to in-process listeners via the event emitter
 * so the REST endpoint can serve them without polling.
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const { EventEmitter } = require('events');
const QRCode = require('qrcode');

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = require('@whiskeysockets/baileys');

const config = require('../config');
const logger = require('../config/logger');

// ── Auth state directory ────────────────────────────────────────────────────
const AUTH_DIR = path.join(config.storage.root, 'wa-auth');
fs.mkdirSync(AUTH_DIR, { recursive: true });

// ── Internal state ──────────────────────────────────────────────────────────
let sock         = null;          // active WASocket instance
let currentQr    = null;          // latest QR string (raw, not data-uri)
let connectionState = 'closed';   // 'closed' | 'connecting' | 'open' | 'qr'
let reconnectTimer = null;

const emitter = new EventEmitter();
emitter.setMaxListeners(20);

// ── Helpers ─────────────────────────────────────────────────────────────────

function normaliseJid(to) {
  // Accept "919876543210", "+91 98765 43210", or already-formatted JIDs
  const digits = String(to).replace(/\D/g, '');
  return digits.includes('@') ? to : `${digits}@s.whatsapp.net`;
}

// ── Connect / reconnect ──────────────────────────────────────────────────────

async function connect(attempt = 1) {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    logger.info({ version, attempt }, 'Baileys: connecting to WhatsApp');

    connectionState = 'connecting';

    sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.macOS('Desktop'),
      printQRInTerminal: false,   // we handle QR ourselves
      logger: logger.child({ module: 'baileys' }),
      connectTimeoutMs: 60_000,
      retryRequestDelayMs: 2_000,
      maxMsgRetryCount: 3,
    });

    // ── Save credentials on update ─────────────────────────────────────────
    sock.ev.on('creds.update', saveCreds);

    // ── Connection state changes ───────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQr = qr;
        connectionState = 'qr';
        emitter.emit('qr', qr);
        logger.info('Baileys: QR code ready for scanning');
      }

      if (connection === 'open') {
        currentQr = null;
        connectionState = 'open';
        emitter.emit('connected');
        logger.info('Baileys: WhatsApp connected ✓');
      }

      if (connection === 'close') {
        connectionState = 'closed';
        emitter.emit('disconnected');

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut  = statusCode === DisconnectReason.loggedOut;

        logger.warn({ statusCode, loggedOut }, 'Baileys: connection closed');

        if (loggedOut) {
          // Wipe auth state and let the UI re-scan a new QR
          logger.warn('Baileys: logged out — clearing auth state');
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          fs.mkdirSync(AUTH_DIR, { recursive: true });
          // Reconnect immediately so a new QR is generated
          reconnect(1);
        } else {
          // Transient disconnect — back-off reconnect
          const delay = Math.min(5_000 * attempt, 60_000);
          logger.info({ delay }, 'Baileys: scheduling reconnect');
          reconnect(attempt + 1, delay);
        }
      }
    });

    // ── Incoming messages → conversationService ────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;              // ignore our own messages
        if (!msg.message)   continue;

        const from = (msg.key.remoteJid || '').replace('@s.whatsapp.net', '').replace('@c.us', '');
        const text = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          ''
        ).trim();
        const messageId = msg.key.id || '';

        if (!from || !text) continue;

        try {
          const conversationService = require('./conversationService');
          await conversationService.handleIncoming({ from, messageId, text, waMessageId: messageId });
        } catch (e) {
          logger.error({ err: e }, 'Baileys: error handling incoming message');
        }
      }
    });

  } catch (err) {
    logger.error({ err }, 'Baileys: connect() error');
    connectionState = 'closed';
    reconnect(attempt + 1, 10_000);
  }
}

function reconnect(attempt, delayMs = 0) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => connect(attempt), delayMs);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the Baileys client. Called once at server startup.
 */
async function startClient() {
  await connect(1);
}

/**
 * Graceful shutdown.
 */
async function stopClient() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (sock) {
    try { sock.end(undefined); } catch (_) { /* ignore */ }
    sock = null;
  }
  connectionState = 'closed';
  logger.info('Baileys: client stopped');
}

/**
 * Send a text message.
 * @param {string} to   - phone number (any format) or JID
 * @param {string} text - message body
 */
async function sendMessage(to, text) {
  if (!sock || connectionState !== 'open') {
    throw new Error('WhatsApp is not connected. Please scan the QR code first.');
  }
  const jid = normaliseJid(to);
  const result = await sock.sendMessage(jid, { text });
  logger.info({ to: jid }, 'Baileys: message sent');
  return { id: result?.key?.id };
}

/**
 * Get current session status.
 * Returns the same shape as the old wahaService.getSessionStatus().
 */
function getSessionStatus() {
  const statusMap = {
    open:       { ok: true,  status: 'WORKING' },
    qr:         { ok: true,  status: 'SCAN_QR_CODE' },
    connecting: { ok: false, status: 'CONNECTING' },
    closed:     { ok: false, status: 'STOPPED' },
  };
  return Promise.resolve(statusMap[connectionState] || { ok: false, status: 'STOPPED' });
}

/**
 * Get QR code as a data-URI PNG image.
 * Returns the same shape as the old wahaService.getQrCode().
 */
async function getQrCode() {
  if (connectionState === 'open') {
    return { ok: false, error: 'Already connected — no QR needed.' };
  }

  // If we have a cached QR, return it immediately
  if (currentQr) {
    try {
      const dataUri = await QRCode.toDataURL(currentQr, { width: 300, margin: 2 });
      return { ok: true, qr: dataUri };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // Wait up to 20s for the next QR event
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, error: 'Timed out waiting for QR code. Make sure the service is running.' });
    }, 20_000);

    emitter.once('qr', async (rawQr) => {
      clearTimeout(timer);
      try {
        const dataUri = await QRCode.toDataURL(rawQr, { width: 300, margin: 2 });
        resolve({ ok: true, qr: dataUri });
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });

    // Trigger reconnect to force a new QR if not already connecting
    if (connectionState === 'closed') {
      connect(1).catch(() => {});
    }
  });
}

/**
 * Send a test message.
 */
function sendTestMessage(to) {
  return sendMessage(to, '✅ Smart MSL Monitor – WhatsApp connection test successful!');
}

/**
 * Disconnect and wipe auth state (logout).
 * The next startClient() call will generate a fresh QR.
 */
async function logout() {
  await stopClient();
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  logger.info('Baileys: logged out and auth state cleared');
  // Reconnect so a new QR appears immediately
  await connect(1);
}

module.exports = {
  startClient,
  stopClient,
  sendMessage,
  getSessionStatus,
  getQrCode,
  sendTestMessage,
  logout,
  emitter,
};
