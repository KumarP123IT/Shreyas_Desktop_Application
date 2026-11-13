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

// Pairing-code linking (alternative to QR — no second-scan race)
let pairingPhone       = null;    // digits-only sender number, e.g. '919876543210'
let pairingRequested   = false;   // one requestPairingCode call per socket
let currentPairingCode = null;

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
      generateHighQualityLinkPreview: false,
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
        maybeRequestPairingCode();
        logger.info('Baileys: QR code ready — open Settings → WhatsApp to scan');
      }

      if (connection === 'open') {
        currentQr         = null;
        connectionState   = 'open';
        connectAttempt    = 0; // reset backoff counter on success
        pairingPhone      = null;
        pairingRequested  = false;
        currentPairingCode = null;
        emitter.emit('connected');
        logger.info('Baileys: WhatsApp connected ✓');
      }

      if (connection === 'close') {
        connectionState    = 'closed';
        currentPairingCode = null;
        pairingRequested   = false; // fresh socket may need a new code
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
  connectionState    = 'closed';
  currentPairingCode = null;
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

// ── Pairing code (phone-number linking, no QR scan) ──────────────────────────

/**
 * Ask Baileys for a pairing code whenever a QR event arrives while a pairing
 * phone number is set and the session isn't registered yet. Called from the
 * connection.update handler; also invoked directly by requestPairingCode().
 */
async function maybeRequestPairingCode() {
  if (!pairingPhone || pairingRequested || !sock) return;
  if (sock.authState?.creds?.registered) return;
  pairingRequested = true;
  try {
    const code = await sock.requestPairingCode(pairingPhone);
    currentPairingCode = code;
    logger.info('Baileys: pairing code generated');
    emitter.emit('pairing-code', code);
  } catch (e) {
    pairingRequested = false; // allow retry on next QR rotation / reconnect
    logger.warn({ err: e.message }, 'Baileys: pairing code request failed');
  }
}

/**
 * Start (or restart) WhatsApp linking via an 8-character pairing code instead
 * of a QR scan. The user enters the code on their phone under
 * WhatsApp → Linked Devices → Link a Device → "Link with phone number".
 *
 * `phone` must be digits only with country code, e.g. '919876543210'.
 * Resolves with { ok, code } or { ok:false, error } after up to 30s.
 */
async function requestPairingCode(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return { ok: false, error: 'Enter a valid WhatsApp number with country code, e.g. 919876543210' };
  }
  if (connectionState === 'open') {
    return { ok: false, error: 'Already connected — no pairing needed.' };
  }

  pairingPhone       = digits;
  pairingRequested   = false;
  currentPairingCode = null;

  // Kick off a connection if the socket is fully stopped so a QR event (and
  // therefore a pairing-code request) is generated.
  if (connectionState === 'closed') {
    connectAttempt = 0;
    connect(1).catch(() => {});
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      emitter.removeListener('pairing-code', onCode);
      resolve({ ok: false, error: 'Timed out waiting for pairing code. Try again in a moment.' });
    }, 30_000);

    const onCode = (code) => {
      clearTimeout(timer);
      resolve({ ok: true, code });
    };

    emitter.once('pairing-code', onCode);
    // If a socket already exists, request immediately — the QR-event path in
    // connection.update is the fallback for fresh/reconnecting sockets.
    maybeRequestPairingCode().catch(() => {});
  });
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

  // Wait up to 30s for the next QR event. Use `on` (not `once`) so the
  // listener stays registered for the lifetime of this promise — Baileys
  // rc14 emits a fresh QR on every "scan again" prompt during multi-device
  // linking, and each event must be able to resolve a pending request.
  return new Promise((resolve) => {
    const onQr = async (rawQr) => {
      cleanup();
      try {
        const dataUri = await QRCode.toDataURL(rawQr, { width: 300, margin: 2 });
        resolve({ ok: true, qr: dataUri });
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      emitter.removeListener('qr', onQr);
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve({ ok: false, error: 'Timed out waiting for QR code. The WhatsApp server may be temporarily unavailable — try again in a moment.' });
    }, 30_000);

    emitter.on('qr', onQr);
  });
}

function sendTestMessage(to) {
  return sendMessage(to, '✅ Smart MSL Monitor – WhatsApp connection test successful!');
}

async function logout() {
  await stopClient();
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  connectAttempt   = 0;
  pairingPhone     = null;
  pairingRequested = false;
  logger.info('Baileys: logged out — auth state cleared');
  await connect(1);
}

module.exports = {
  startClient, stopClient,
  sendMessage, getSessionStatus, getQrCode, requestPairingCode,
  sendTestMessage, logout, emitter,
};
