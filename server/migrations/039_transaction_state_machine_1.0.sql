-- Stage 11A — Transaction State Machine 1.0 (server-authoritative).
-- No UI / no Stripe in this migration — schema + audit only.

CREATE TABLE IF NOT EXISTS vauto_transactions (
  id                      TEXT PRIMARY KEY,
  listing_id              TEXT NOT NULL,
  buyer_id                TEXT NOT NULL,
  seller_id               TEXT NOT NULL,
  status                  TEXT NOT NULL
    CHECK (status IN (
      'DISCUSSION', 'OFFER_PENDING', 'NEGOTIATING', 'AGREED',
      'PAYMENT_PENDING', 'PAID', 'SHIPPING_PENDING', 'SHIPPED',
      'DELIVERED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DISPUTED'
    )),
  current_price           NUMERIC(12, 2) NULL,
  currency                TEXT NOT NULL DEFAULT 'EUR',
  version                 INTEGER NOT NULL DEFAULT 0,
  idempotency_key         TEXT NULL,
  state_machine_version   TEXT NOT NULL DEFAULT '1.0',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vauto_transactions_buyer_seller_diff CHECK (buyer_id <> seller_id)
);

-- Optimistic locking lookup: (id, version)
CREATE INDEX IF NOT EXISTS idx_vauto_transactions_id_version
  ON vauto_transactions (id, version);

CREATE INDEX IF NOT EXISTS idx_vauto_transactions_buyer
  ON vauto_transactions (buyer_id);

CREATE INDEX IF NOT EXISTS idx_vauto_transactions_seller
  ON vauto_transactions (seller_id);

CREATE INDEX IF NOT EXISTS idx_vauto_transactions_listing
  ON vauto_transactions (listing_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vauto_transactions_create_idempotency
  ON vauto_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS vauto_transaction_events (
  id               TEXT PRIMARY KEY,
  transaction_id   TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE CASCADE,
  actor_type       TEXT NOT NULL
    CHECK (actor_type IN ('BUYER', 'SELLER', 'SYSTEM', 'ADMIN')),
  actor_id         TEXT NOT NULL,
  event_type       TEXT NOT NULL,
  from_status      TEXT NOT NULL,
  to_status        TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  payload_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vauto_transaction_events_idempotency
  ON vauto_transaction_events (transaction_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_vauto_transaction_events_tx_created
  ON vauto_transaction_events (transaction_id, created_at);

CREATE TABLE IF NOT EXISTS vauto_transaction_audit (
  id               TEXT PRIMARY KEY,
  transaction_id   TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE RESTRICT,
  sequence_id      INTEGER NOT NULL,
  event_id         TEXT NOT NULL REFERENCES vauto_transaction_events (id) ON DELETE RESTRICT,
  state_hash       TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vauto_transaction_audit_seq UNIQUE (transaction_id, sequence_id)
);

CREATE INDEX IF NOT EXISTS idx_vauto_transaction_audit_tx
  ON vauto_transaction_audit (transaction_id, sequence_id);

-- Append-only audit (H-03 / 11E.1) — also enforced via migration 043 for upgrades.
CREATE OR REPLACE FUNCTION vauto_transaction_audit_forbid_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vauto_transaction_audit_no_update ON vauto_transaction_audit;
CREATE TRIGGER trg_vauto_transaction_audit_no_update
  BEFORE UPDATE ON vauto_transaction_audit
  FOR EACH ROW
  EXECUTE PROCEDURE vauto_transaction_audit_forbid_mutation();

DROP TRIGGER IF EXISTS trg_vauto_transaction_audit_no_delete ON vauto_transaction_audit;
CREATE TRIGGER trg_vauto_transaction_audit_no_delete
  BEFORE DELETE ON vauto_transaction_audit
  FOR EACH ROW
  EXECUTE PROCEDURE vauto_transaction_audit_forbid_mutation();
