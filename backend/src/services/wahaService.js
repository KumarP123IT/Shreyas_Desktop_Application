/**
 * WAHA (WhatsApp HTTP API) service.
 * Reads base URL and API key from AppSetting at call time.
 */

const axios = require('axios');
const settingsRepo = require('../repositories/settingsRepository');
const logger = require('../config/logger');

async function getClient() {
  const s = await settingsRepo.getAllDecrypted();
  const baseURL = s.waha_url || 'http://localhost:3000';
  const apiKey = s.waha_api_key || '';
  const session = s.waha_session || 'default';

  return {
    http: axios.create({
      baseURL,
      timeout: 15_000,
      headers: apiKey ? { 'X-Api-Key': apiKey } : {},
    }),
    session,
    baseURL,
  };
}

/**
 * Send a text message via WAHA.
 */
async function sendMessage(to, text) {
  const { http, session } = await getClient();
  // Normalise phone: ensure @c.us suffix
  const chatId = to.includes('@') ? to : `${to.replace(/\D/g, '')}@c.us`;
  const res = await http.post(`/api/sendText`, {
    chatId,
    text,
    session,
  });
  logger.info({ to: chatId }, 'WhatsApp message sent');
  return res.data;
}

/**
 * Get WAHA session status.
 */
async function getSessionStatus() {
  try {
    const { http, session } = await getClient();
    const res = await http.get(`/api/sessions/${session}`);
    return { ok: true, status: res.data?.status || 'unknown', data: res.data };
  } catch (e) {
    return { ok: false, status: 'error', error: e.message };
  }
}

/**
 * Get QR code for pairing.
 */
async function getQrCode() {
  try {
    const { http, session } = await getClient();
    const res = await http.get(`/api/${session}/auth/qr`, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(res.data).toString('base64');
    return { ok: true, qr: `data:image/png;base64,${base64}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Send a test message.
 */
async function sendTestMessage(to) {
  return sendMessage(to, '✅ Smart MSL Monitor – WhatsApp connection test successful!');
}

module.exports = { sendMessage, getSessionStatus, getQrCode, sendTestMessage };
