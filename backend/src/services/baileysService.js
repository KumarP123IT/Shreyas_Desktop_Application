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
let loggedOutCode   = 401;        // filled after first import

const emitter = new EventEmitter();
emitter.setMaxListeners(20);

// ── Lazy ESM loader ──────────────────────────────────────────────────────────
// Baileys is ESM-only; dynamic import() works from CommonJS in Node 20.
let _baileys = null;
async function getBaileys() {
  if (!_baileys) {
    _baileys = await import('@whiskeysockets/baileys');
    loggedOutCode = _baileys.DisconnectReason?.loggedOut ?? 401;
  }
  return _baileys;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normaliseJid(to) {
  const s = String(to).trim();
  // Already a full JID (…@s.whatsapp.net, …@lid, …@g.us) — don't mangle it.
  // The old digits-first check meant `includes('@')` could never match.
  if (s.includes('@')) return s;
  const digits = s.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

function reconnect(attempt, delayMs = 0) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => connect(attempt), delayMs);
}

// ── Connect ──────────────────────────────────────────────────────────────────

async function connect(attempt = 1) {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  try {
    const {
      makeWASocket,
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      Browsers,
    } = await getBaileys();

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version }          = await fetchLatestBaileysVersion();
    logger.info({ version, attempt }, 'Baileys: connecting to WhatsApp');

    connectionState = 'connecting';

    sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.macOS('Desktop'),
      printQRInTerminal: false,
      logger: logger.child({ module: 'baileys' }),
      connectTimeoutMs: 60_000,
      retryRequestDelayMs: 2_000,
      maxMsgRetryCount: 3,
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
        logger.info('Baileys: QR code ready for scanning');
      }

      if (connection === 'open') {
        currentQr       = null;
        connectionState = 'open';
        emitter.emit('connected');
        logger.info('Baileys: WhatsApp connected ✓');
      }

      if (connection === 'close') {
        connectionState = 'closed';
        emitter.emit('disconnected');

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === loggedOutCode;
        logger.warn({ statusCode, isLoggedOut }, 'Baileys: connection closed');

        if (isLoggedOut) {
          // Wipe auth state so a fresh QR is generated
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          fs.mkdirSync(AUTH_DIR, { recursive: true });
          reconnect(1, 1000);
        } else {
          const delay = Math.min(5_000 * attempt, 60_000);
          reconnect(attempt + 1, delay);
        }
      }
    });

    // Route incoming messages to conversation service
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message)   continue;

        // Baileys 7 can deliver the sender as an @lid address; in that case
        // remoteJidAlt holds the real phone-number JID we can reply to and
        // match against the configured recipient number.
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
    reconnect(attempt + 1, 10_000);
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
    open:       { ok: true,  status: 'WORKING'     },
    qr:         { ok: true,  status: 'SCAN_QR_CODE' },
    connecting: { ok: false, status: 'CONNECTING'  },
    closed:     { ok: false, status: 'STOPPED'     },
  };
  return Promise.resolve(map[connectionState] || { ok: false, status: 'STOPPED' });
}

async function getQrCode() {
  if (connectionState === 'open') {
    return { ok: false, error: 'Already connected — no QR needed.' };
  }

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
      resolve({ ok: false, error: 'Timed out waiting for QR code.' });
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

    // Kick off a new connection if idle so a QR is generated
    if (connectionState === 'closed') connect(1).catch(() => {});
  });
}

function sendTestMessage(to) {
  return sendMessage(to, '✅ Smart MSL Monitor – WhatsApp connection test successful!');
}

async function logout() {
  await stopClient();
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  logger.info('Baileys: logged out — auth state cleared');
  await connect(1);
}

module.exports = {
  startClient, stopClient,
  sendMessage, getSessionStatus, getQrCode,
  sendTestMessage, logout, emitter,
};
