-- Remove orphaned WAHA settings (WAHA service was replaced by Baileys)
DELETE FROM app_settings WHERE key IN ('waha_url', 'waha_api_key', 'waha_session');

-- Add smtp_allow_invalid_cert for existing installs (defaults to false = validate certs)
INSERT INTO app_settings (key, value, isSecret, updatedAt)
VALUES ('smtp_allow_invalid_cert', 'false', 0, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO NOTHING;

-- Add app_name setting for existing installs
INSERT INTO app_settings (key, value, isSecret, updatedAt)
VALUES ('app_name', 'Smart MSL Monitor', 0, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO NOTHING;
