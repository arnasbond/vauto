-- Extend Vauto schema for geo, trust, moderation, and chat read state
ALTER TABLE listings ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS vin_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS provider_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS promoted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users ADD COLUMN IF NOT EXISTS warned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS sms_fallback_sent_for TEXT;

CREATE TABLE IF NOT EXISTS support_reports (
  id                TEXT PRIMARY KEY,
  reporter_id       TEXT NOT NULL,
  reporter_name     TEXT NOT NULL,
  category          TEXT NOT NULL,
  urgency           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
  comment           TEXT NOT NULL,
  listing_id        TEXT,
  listing_title     TEXT,
  chat_id           TEXT,
  reported_user_id  TEXT,
  chat_preview      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_reports_status ON support_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS banned_users (
  user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  banned_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
