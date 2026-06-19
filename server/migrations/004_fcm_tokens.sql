CREATE TABLE IF NOT EXISTS fcm_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  platform   TEXT NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens (user_id);
