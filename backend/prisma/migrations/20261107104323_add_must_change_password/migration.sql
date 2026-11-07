-- Migration: add mustChangePassword column to users table
-- Safe to run on existing databases (ALTER TABLE with DEFAULT)

ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
