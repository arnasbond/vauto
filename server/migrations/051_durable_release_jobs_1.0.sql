-- Stage 11G.3 — Durable seller release jobs (H-01).
-- INVARIANT: DELIVERED deals must have SELLER_TRANSFERRED and/or a PENDING/PROCESSING job.

CREATE TABLE IF NOT EXISTS seller_release_jobs (
  id                TEXT PRIMARY KEY,
  transaction_id    TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE RESTRICT,
  actor_user_id     TEXT NOT NULL,
  idempotency_key   TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  attempts          INTEGER NOT NULL DEFAULT 0
    CHECK (attempts >= 0),
  available_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error        TEXT NULL,
  transfer_status   TEXT NULL,
  delivery_integration_version TEXT NOT NULL DEFAULT '1.2',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ NULL,
  CONSTRAINT uq_seller_release_jobs_transaction UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_release_jobs_pending
  ON seller_release_jobs (status, available_at)
  WHERE status IN ('PENDING', 'PROCESSING');

CREATE INDEX IF NOT EXISTS idx_seller_release_jobs_txn
  ON seller_release_jobs (transaction_id);
