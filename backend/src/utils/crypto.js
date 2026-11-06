/**
 * Symmetric encryption for secrets stored in AppSetting.
 * Uses AES-256-CTR via Node's built-in crypto module.
 */

const crypto = require('crypto');
const config = require('../config');

const ALGORITHM = 'aes-256-ctr';
// Derive a fixed 32-byte key from ENCRYPTION_KEY regardless of its format/length.
const KEY = crypto.createHash('sha256').update(String(config.encryption.key)).digest();
const IV_LENGTH = 16;

/**
 * Encrypt a plaintext string → returns hex(iv:ciphertext).
 */
function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt hex(iv:ciphertext) → plaintext string.
 */
function decrypt(ciphertext) {
  if (!ciphertext || !ciphertext.includes(':')) return ciphertext;
  const [ivHex, encHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
