-- Stage 11H.2 — Dispute financial finality & evidence immutability.
-- C-01: DECIDED_* + durable dispute_financial_jobs (final RESOLVED_* only after 11F success).
-- H-02: evidence_json immutability triggers.

-- Expand dispute status CHECK for DECIDED_* (decision ≠ financial finality).
ALTER TABLE vauto_disputes DROP CONSTRAINT IF EXISTS vauto_disputes_status_check;
ALTER TABLE vauto_disputes
  ADD CONSTRAINT vauto_disputes_status_check
  CHECK (status IN (
    'OPEN',
    'UNDER_REVIEW',
    'DECIDED_BUYER_REFUND',
    'DECIDED_SELLER_PAYOUT',
    'RESOLVED_BUYER_REFUND',
    'RESOLVED_SELLER_PAYOUT',
    'CANCELLED'
  ));

CREATE TABLE IF NOT EXISTS dispute_financial_jobs (
  id                       TEXT PRIMARY KEY,
  dispute_id               TEXT NOT NULL REFERENCES vauto_disputes (id) ON DELETE RESTRICT,
  transaction_id           TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE RESTRICT,
  resolution               TEXT NOT NULL
    CHECK (resolution IN ('RESOLVE_BUYER_REFUND', 'RESOLVE_SELLER_PAYOUT')),
  idempotency_key          TEXT NOT NULL,
  actor_user_id            TEXT NOT NULL,
  seller_id                TEXT NOT NULL,
  buyer_id                 TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'FINANCIAL_ACTION_PENDING'
    CHECK (status IN (
      'FINANCIAL_ACTION_PENDING',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
      'MANUAL_REVIEW'
    )),
  attempts                 INTEGER NOT NULL DEFAULT 0
    CHECK (attempts >= 0),
  available_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error               TEXT NULL,
  transfer_status          TEXT NULL,
  processing_started_at    TIMESTAMPTZ NULL,
  dispute_engine_version   TEXT NOT NULL DEFAULT '1.1',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at             TIMESTAMPTZ NULL,
  CONSTRAINT uq_dispute_financial_jobs_dispute UNIQUE (dispute_id),
  CONSTRAINT uq_dispute_financial_jobs_txn UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_dispute_financial_jobs_pending
  ON dispute_financial_jobs (status, available_at)
  WHERE status IN ('FINANCIAL_ACTION_PENDING', 'PROCESSING');

CREATE INDEX IF NOT EXISTS idx_dispute_financial_jobs_txn
  ON dispute_financial_jobs (transaction_id);

-- H-02: evidence_json is immutable; dispute rows may not be deleted.
CREATE OR REPLACE FUNCTION vauto_disputes_forbid_evidence_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Dispute evidence is immutable';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.evidence_json IS DISTINCT FROM OLD.evidence_json THEN
      RAISE EXCEPTION 'Dispute evidence is immutable';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
       OR NEW.opened_by_user_id IS DISTINCT FROM OLD.opened_by_user_id
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Dispute evidence is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vauto_disputes_evidence_immutable ON vauto_disputes;
CREATE TRIGGER trg_vauto_disputes_evidence_immutable
  BEFORE UPDATE OR DELETE ON vauto_disputes
  FOR EACH ROW
  EXECUTE PROCEDURE vauto_disputes_forbid_evidence_mutation();
