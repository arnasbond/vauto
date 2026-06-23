ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_plan TEXT;

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plan_id           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active',
  stripe_session_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user
  ON billing_subscriptions (user_id, created_at DESC);
