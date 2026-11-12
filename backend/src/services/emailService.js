/**
 * Email service – Nodemailer + SMTP.
 * Reads credentials from AppSetting (decrypted at send time).
 */

const nodemailer = require('nodemailer');
const settingsRepo = require('../repositories/settingsRepository');
const logger = require('../config/logger');

let _transporter = null;
let _configHash = '';

/**
 * Build or reuse SMTP transporter.
 * Reloads if settings have changed.
 */
async function getTransporter() {
  const s = await settingsRepo.getAllDecrypted();
  const hash = JSON.stringify([s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_pass, s.smtp_allow_invalid_cert]);
  if (_transporter && hash === _configHash) return _transporter;

  if (!s.smtp_host) throw new Error('SMTP host not configured. Go to Settings → Email.');

  _transporter = nodemailer.createTransport({
    host: s.smtp_host,
    port: parseInt(s.smtp_port || '587'),
    secure: parseInt(s.smtp_port || '587') === 465,
    auth: {
      user: s.smtp_user,
      pass: s.smtp_pass,
    },
    // tls.rejectUnauthorized defaults to true (validate certs).
    // Only disable if the admin has explicitly opted in via Settings.
    tls: { rejectUnauthorized: s.smtp_allow_invalid_cert !== 'true' },
  });
  _configHash = hash;
  return _transporter;
}

/**
 * Send an email.
 */
async function sendEmail({ to, subject, html, text }) {
  const s = await settingsRepo.getAllDecrypted();
  const from = s.smtp_from || s.smtp_user || 'noreply@shreyas.local';
  const transporter = await getTransporter();

  const info = await transporter.sendMail({ from, to, subject, html, text: text || '' });
  logger.info({ messageId: info.messageId, to }, 'Email sent');
  return info;
}

/**
 * Send a test email.
 */
async function sendTestEmail(to) {
  return sendEmail({
    to,
    subject: 'Smart MSL Monitor – Test Email',
    html: '<p>This is a test email from your Smart MSL Monitor system.</p>',
    text: 'This is a test email from your Smart MSL Monitor system.',
  });
}

/**
 * Verify SMTP connection.
 */
async function verifySmtp() {
  try {
    const transporter = await getTransporter();
    await transporter.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendEmail, sendTestEmail, verifySmtp };
