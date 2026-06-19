-- Wallet, reviews, push subscriptions, alert queries
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS business_type TEXT,
  ADD COLUMN IF NOT EXISTS sold_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auth_provider TEXT;

CREATE TABLE IF NOT EXISTS seller_reviews (
  id            TEXT PRIMARY KEY,
  seller_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  listing_id    TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  listing_title TEXT NOT NULL,
  reviewer_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  rating        SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_seller ON seller_reviews (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_listing ON seller_reviews (listing_id);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount      NUMERIC(12, 2) NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('top_up', 'promote', 'refund')),
  listing_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth_key   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE TABLE IF NOT EXISTS user_alert_queries (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  query      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, query)
);
