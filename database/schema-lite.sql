-- Lite schema — string IDs matching the mobile app (localStorage shape)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  city        TEXT NOT NULL,
  avatar_url  TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listings (
  id            TEXT PRIMARY KEY,
  seller_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  price         NUMERIC(12, 2) NOT NULL,
  price_label   TEXT,
  location      TEXT NOT NULL,
  distance_km   DOUBLE PRECISION NOT NULL DEFAULT 0,
  image         TEXT NOT NULL,
  category      TEXT NOT NULL,
  tags          JSONB NOT NULL DEFAULT '[]',
  contact       TEXT,
  has_video     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_listings (
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  listing_id  TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS chat_threads (
  id              TEXT PRIMARY KEY,
  listing_id      TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  listing_title   TEXT NOT NULL,
  buyer_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seller_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  escrow_offered  BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listings_created ON listings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages (thread_id, created_at);

CREATE TABLE IF NOT EXISTS escrow_transactions (
  id              TEXT PRIMARY KEY,
  thread_id       TEXT NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
  listing_id      TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  buyer_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seller_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount          NUMERIC(12, 2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'offered'
                  CHECK (status IN ('offered','paying','paid','label_sent','completed','cancelled')),
  tracking_code   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_escrow_thread ON escrow_transactions (thread_id);
CREATE INDEX IF NOT EXISTS idx_escrow_buyer ON escrow_transactions (buyer_id, status);
