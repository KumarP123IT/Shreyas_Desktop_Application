-- Migration: force existing users to change their password on next login.
-- Existing installs may still be using the seeded default password, so we
-- cannot distinguish them in SQL (bcrypt hashes are salted). Flagging every
-- non-deleted user is the safe option — each user sets a new password once.

UPDATE "users" SET "mustChangePassword" = true WHERE "deletedAt" IS NULL;
