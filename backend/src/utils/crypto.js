/**
 * Symmetric encryption for secrets stored in AppSetting.
 * AES-256-GCM — provides both confidentiality AND integrity (auth tag).
 *
 * Format: hex(iv):hex(authTag):hex(ciphertext)
 *
 * Backwards-compatible: the old CTR format (2-part "iv:cipher") is
 * detected and decrypted with CTR so existing stored values keep working.
 */

'use strict';

const crypto = require('crypto');
const config = require('../config');
const logger = require('../config/logger');

const ALGORITHM  = 'aes-256-gcm';
const IV_LENGTH  = 12;   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;   // 128-bit auth tag

// Derive a fixed 32-byte key from ENCRYPTION_KEY regardless of input length
const KEY = crypto.createHash('sha256').update(String(config.encryption.key)).digest();

/**
 * Encrypt plaintext → "hex(iv):hex(authTag):hex(ciphertext)"
 */
function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const iv     = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv, { authTagLength: TAG_LENGTH });
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/**
 * Decrypt a ciphertext string.
 * Handles both the new GCM format (3 parts) and the legacy CTR format (2 parts).
 */
function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;

  const parts = ciphertext.split(':');

  // ── New GCM format ─────────────────────────────────────────────────────────
  if (parts.length === 3) {
    const [ivHex, tagHex, encHex] = parts;
    const iv  = Buffer.from(ivHex,  'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch (e) {
      // Tampered/corrupt ciphertext OR wrong ENCRYPTION_KEY — never silent,
      // a bad key makes every stored secret decrypt to null.
      logger.error({ err: e }, 'GCM decrypt failed — check ENCRYPTION_KEY matches the one used at encrypt time');
      return null;
    }
  }

  // ── Legacy CTR format (backwards compat) ───────────────────────────────────
  if (parts.length === 2) {
    const [ivHex, encHex] = parts;
    const iv  = Buffer.from(ivHex,  'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-ctr', KEY, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }

  // Plain text (not encrypted) — return as-is
  return ciphertext;
}

module.exports = { encrypt, decrypt };
