-- Run on existing PostgreSQL volumes:
-- psql $DATABASE_URL -f database/migrate-expires.sql

ALTER TABLE listings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE listings
SET expires_at = created_at + interval '90 days'
WHERE expires_at IS NULL;
