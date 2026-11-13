/**
 * Baileys WhatsApp Service
 * ─────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for wahaService.js.
 * Uses @whiskeysockets/baileys — pure Node.js, no Docker, no Chromium.
 *
 * Baileys v7 is ESM-only. This file is CommonJS, so we use dynamic import()
 * inside async functions — this is fully supported in Node.js 20.
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const { EventEmitter } = require('events');
const QRCode = require('qrcode');

const config = require('../config');
const logger = require('../config/logger');

// ── Auth state directory ────────────────────────────────────────────────────
const AUTH_DIR = path.join(config.storage.root, 'wa-auth');
fs.mkdirSync(AUTH_DIR, { recursive: true });

// ── Internal state ──────────────────────────────────────────────────────────
let sock            = null;
let currentQr       = null;
let connectionState = 'closed';   // 'closed' | 'connecting' | 'open' | 'qr'
let reconnectTimer  = null;
let connectAttempt  = 0;          // reset to 0 on successful connect or manual logout
const MAX_AUTO_RETRIES = 10;      // after this many consecutive failures, stop and wait for user action

const emitter = new EventEmitter();
emitter.setMaxListeners(20);

// ── Lazy ESM loader ──────────────────────────────────────────────────────────
let _baileys = null;
async function getBaileys() {
  if (!_baileys) {
    _baileys = await import('@whiskeysockets/baileys');
  }
  return _baileys;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normaliseJid(to) {
  const s = String(to).trim();
  if (s.includes('@')) return s;
  const digits = s.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

function scheduleReconnect(attempt, delayMs) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => connect(attempt), delayMs);
}

// ── Connect ──────────────────────────────────────────────────────────────────

async function connect(attempt = 1) {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  // Stop auto-retrying after MAX_AUTO_RETRIES — user must action from UI
  if (attempt > MAX_AUTO_RETRIES) {
    connectionState = 'closed';
    logger.warn({ attempt }, 'Baileys: max auto-reconnect attempts reached — waiting for user to trigger reconnect from UI');
    return;
  }

  connectAttempt = attempt;

  try {
    const {
      makeWASocket,
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      Browsers,
      DisconnectReason,
    } = await getBaileys();

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version }          = await fetchLatestBaileysVersion();
    logger.info({ version, attempt }, 'Baileys: connecting to WhatsApp');

    connectionState = 'connecting';

    // Use a child logger set to 'warn' so Baileys internal trace/debug/info
    // messages don't flood the application log file.
    const baileysLogger = logger.child({ module: 'baileys' });
    baileysLogger.level = 'warn';

    sock = makeWASocket({
      version,
      auth:    state,
      browser: Browsers.macOS('Desktop'),
      printQRInTerminal: false,
      logger:  baileysLogger,
      connectTimeoutMs:   60_000,
      retryRequestDelayMs: 2_000,
      maxMsgRetryCount:    3,
      // syncFullHistory:true (the Baileys default) causes WhatsApp to drop
      // the connection with status 428 before a QR is generated on a fresh
      // session. Disabling it lets the QR flow complete normally.
      syncFullHistory:       false,
      // Don't mark the linked device as online — reduces server-side
      // suspicion on new sessions that have no prior message history.
      markOnlineOnConnect:   false,
    });

    // Save credentials whenever they change
    sock.ev.on('creds.update', saveCreds);

    // Connection lifecycle
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQr       = qr;
        connectionState = 'qr';
        emitter.emit('qr', qr);
        logger.info('Baileys: QR code ready — open Settings → WhatsApp to scan');
      }

      if (connection === 'open') {
        currentQr       = null;
        connectionState = 'open';
        connectAttempt  = 0; // reset backoff counter on success
        emitter.emit('connected');
        logger.info('Baileys: WhatsApp connected ✓');
      }

      if (connection === 'close') {
        connectionState = 'closed';
        emitter.emit('disconnected');

        const statusCode  = lastDisconnect?.error?.output?.statusCode;
        const reason      = Object.entries(DisconnectReason).find(([, v]) => v === statusCode)?.[0] ?? statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;        // 401
        const isBadSession = statusCode === DisconnectReason.badSession;      // 500
        const isForbidden  = statusCode === DisconnectReason.forbidden;       // 403

        logger.warn({ statusCode, reason, isLoggedOut }, 'Baileys: connection closed');

        if (isLoggedOut || isBadSession || isForbidden) {
          // Wipe auth state — a fresh QR scan is required
          logger.info({ reason }, 'Baileys: clearing auth state and restarting for fresh QR');
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          fs.mkdirSync(AUTH_DIR, { recursive: true });
          connectAttempt = 0;
          scheduleReconnect(1, 2_000);
        } else {
          // Transient error — exponential backoff capped at 60s
          const delay = Math.min(5_000 * attempt, 60_000);
          scheduleReconnect(attempt + 1, delay);
        }
      }
    });

    // Route incoming messages to conversation service
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message)   continue;

        const jid = msg.key.remoteJid || '';
        if (jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue;
        const senderJid = jid.endsWith('@lid') && msg.key.remoteJidAlt
          ? msg.key.remoteJidAlt
          : jid;
        const from = senderJid
          .replace('@s.whatsapp.net', '')
          .replace('@c.us', '');
        const text = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          ''
        ).trim();
        const messageId = msg.key.id || '';
        if (!from || !text) continue;

        try {
          const convSvc = require('./conversationService');
          await convSvc.handleIncoming({ from, messageId, text, waMessageId: messageId });
        } catch (e) {
          logger.error({ err: e }, 'Baileys: error handling incoming message');
        }
      }
    });

  } catch (err) {
    logger.error({ err }, 'Baileys: connect() error');
    connectionState = 'closed';
    const delay = Math.min(5_000 * attempt, 60_000);
    scheduleReconnect(attempt + 1, delay);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

async function startClient() {
  await connect(1);
}

async function stopClient() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (sock) {
    try { sock.end(undefined); } catch (_) { /* ignore */ }
    sock = null;
  }
  connectionState = 'closed';
  logger.info('Baileys: client stopped');
}

async function sendMessage(to, text) {
  if (!sock || connectionState !== 'open') {
    throw new Error('WhatsApp is not connected. Please scan the QR code first.');
  }
  const jid    = normaliseJid(to);
  const result = await sock.sendMessage(jid, { text });
  logger.info({ to: jid }, 'Baileys: message sent');
  return { id: result?.key?.id };
}

function getSessionStatus() {
  const map = {
    open:       { ok: true,  status: 'WORKING'      },
    qr:         { ok: true,  status: 'SCAN_QR_CODE'  },
    connecting: { ok: false, status: 'CONNECTING'   },
    closed:     { ok: false, status: 'STOPPED'      },
  };
  return Promise.resolve(map[connectionState] || { ok: false, status: 'STOPPED' });
}

async function getQrCode() {
  if (connectionState === 'open') {
    return { ok: false, error: 'Already connected — no QR needed.' };
  }

  // If we have a fresh QR ready, return it immediately
  if (currentQr) {
    try {
      const dataUri = await QRCode.toDataURL(currentQr, { width: 300, margin: 2 });
      return { ok: true, qr: dataUri };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // If the auto-retry limit was hit, kick off a fresh connect so a new QR
  // is generated rather than making the user restart the service.
  if (connectionState === 'closed') {
    connectAttempt = 0;
    connect(1).catch(() => {});
  }

  // Wait up to 30s for the next QR event
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, error: 'Timed out waiting for QR code. The WhatsApp server may be temporarily unavailable — try again in a moment.' });
    }, 30_000);

    emitter.once('qr', async (rawQr) => {
      clearTimeout(timer);
      try {
        const dataUri = await QRCode.toDataURL(rawQr, { width: 300, margin: 2 });
        resolve({ ok: true, qr: dataUri });
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  });
}

function sendTestMessage(to) {
  return sendMessage(to, '✅ Smart MSL Monitor – WhatsApp connection test successful!');
}

async function logout() {
  await stopClient();
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  connectAttempt = 0;
  logger.info('Baileys: logged out — auth state cleared');
  await connect(1);
}

module.exports = {
  startClient, stopClient,
  sendMessage, getSessionStatus, getQrCode,
  sendTestMessage, logout, emitter,
};
