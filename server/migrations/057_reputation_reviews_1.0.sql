-- Stage 11I.1 — Reputation Engine & Verified Reviews 1.0
-- Reviews only after COMPLETED deals; UNIQUE(transaction_id, reviewer_id).

CREATE TABLE IF NOT EXISTS vauto_reviews (
  id                         TEXT PRIMARY KEY,
  transaction_id             TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE RESTRICT,
  reviewer_id                TEXT NOT NULL,
  reviewee_id                TEXT NOT NULL,
  rating                     INTEGER NOT NULL
    CHECK (rating >= 1 AND rating <= 5),
  comment                    TEXT NULL,
  reputation_engine_version  TEXT NOT NULL DEFAULT '1.0',
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vauto_reviews_txn_reviewer UNIQUE (transaction_id, reviewer_id),
  CONSTRAINT chk_vauto_reviews_no_self CHECK (reviewer_id <> reviewee_id)
);

CREATE INDEX IF NOT EXISTS idx_vauto_reviews_reviewee
  ON vauto_reviews (reviewee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vauto_reviews_reviewer
  ON vauto_reviews (reviewer_id);

CREATE INDEX IF NOT EXISTS idx_vauto_reviews_transaction
  ON vauto_reviews (transaction_id);
