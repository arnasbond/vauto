CREATE TABLE IF NOT EXISTS user_push_tokens (
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token        TEXT NOT NULL,
  device_type  TEXT NOT NULL DEFAULT 'android',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user ON user_push_tokens (user_id);

INSERT INTO user_push_tokens (user_id, token, device_type, created_at)
SELECT user_id, token, platform, created_at
FROM fcm_tokens
ON CONFLICT (user_id, token) DO NOTHING;
