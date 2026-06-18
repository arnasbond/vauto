-- Run on existing PostgreSQL volumes created before escrow support:
-- psql $DATABASE_URL -f database/migrate-escrow.sql

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
