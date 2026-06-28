-- Referral credits + wishlist match notification tracking

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code TEXT,
  ADD COLUMN IF NOT EXISTS free_protection_credits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referred_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code
  ON users (referral_code)
  WHERE referral_code IS NOT NULL;

ALTER TABLE user_requirements
  ADD COLUMN IF NOT EXISTS last_notified_listing_id TEXT;

CREATE TABLE IF NOT EXISTS user_notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  url         TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user
  ON user_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_requirements_match
  ON user_requirements (status, category, city);
