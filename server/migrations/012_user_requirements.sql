-- Buyer requirements / no-match leads (Offer Engine)
CREATE TABLE IF NOT EXISTS user_requirements (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  query         TEXT NOT NULL,
  category      TEXT,
  city          TEXT,
  max_price     NUMERIC(12, 2),
  min_price     NUMERIC(12, 2),
  size          TEXT,
  subcategory   TEXT,
  wardrobe_mode BOOLEAN NOT NULL DEFAULT false,
  filters       JSONB,
  source        TEXT NOT NULL DEFAULT 'agent',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_requirements_user
  ON user_requirements (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_requirements_active
  ON user_requirements (status, created_at DESC);
