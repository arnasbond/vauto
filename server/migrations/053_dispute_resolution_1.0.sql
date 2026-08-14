-- Stage 11H.1 — Dispute Resolution & Arbitrage Engine 1.0
-- Open dispute freezes payouts (TRANSFER_BLOCKED); ADMIN/SYSTEM resolve only.

CREATE TABLE IF NOT EXISTS vauto_disputes (
  id                      TEXT PRIMARY KEY,
  transaction_id          TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE RESTRICT,
  opened_by_user_id       TEXT NOT NULL,
  reason                  TEXT NOT NULL
    CHECK (reason IN (
      'ITEM_NOT_RECEIVED',
      'DAMAGED',
      'NOT_AS_DESCRIBED',
      'OTHER'
    )),
  description             TEXT NOT NULL DEFAULT '',
  evidence_json           JSONB NULL,
  status                  TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN (
      'OPEN',
      'UNDER_REVIEW',
      'DECIDED_BUYER_REFUND',
      'DECIDED_SELLER_PAYOUT',
      'RESOLVED_BUYER_REFUND',
      'RESOLVED_SELLER_PAYOUT',
      'CANCELLED'
    )),
  resolution_notes        TEXT NULL,
  resolved_by_user_id     TEXT NULL,
  dispute_engine_version  TEXT NOT NULL DEFAULT '1.0',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at             TIMESTAMPTZ NULL,
  CONSTRAINT uq_vauto_disputes_transaction UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_vauto_disputes_status
  ON vauto_disputes (status);

CREATE INDEX IF NOT EXISTS idx_vauto_disputes_opened_by
  ON vauto_disputes (opened_by_user_id);
