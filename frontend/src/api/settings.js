import client from './client';

export const settingsApi = {
  get:            ()    => client.get('/settings'),
  update:         (data)=> client.patch('/settings', data),
  testEmail:      (to)  => client.post('/settings/test-email', { to }),
  verifySmtp:     ()    => client.get('/settings/smtp-verify'),
  wahaStatus:     ()    => client.get('/settings/waha-status'),
  wahaQr:         ()    => client.get('/settings/waha-qr'),
  wahaPairingCode:(phone)=> client.post('/settings/waha-pairing-code', { phone }),
  testWhatsapp:   (to)  => client.post('/settings/test-whatsapp', { to }),
  wahaLogout:     ()    => client.post('/settings/waha-logout'),
};
