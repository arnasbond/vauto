-- Stage 11F.1 — Payment Domain & Ledger 1.0 (server-authoritative financial core).
-- NO external Stripe / PSP API in this migration — internal ledger + intents only.
-- Financial authority: vauto_deal_snapshots.amount_cents (INT) + accepted offer cents.

CREATE TABLE IF NOT EXISTS vauto_payment_intents (
  id                 TEXT PRIMARY KEY,
  transaction_id     TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE RESTRICT,
  deal_snapshot_id   TEXT NOT NULL REFERENCES vauto_deal_snapshots (id) ON DELETE RESTRICT,
  buyer_id           TEXT NOT NULL,
  seller_id          TEXT NOT NULL,
  amount_cents       INTEGER NOT NULL CHECK (amount_cents > 0),
  currency           TEXT NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  status             TEXT NOT NULL CHECK (
    status IN (
      'CREATED',
      'AUTHORIZING',
      'HELD_IN_ESCROW',
      'RELEASED_TO_SELLER',
      'REFUNDED',
      'FAILED'
    )
  ),
  version            INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  idempotency_key    TEXT NOT NULL,
  payment_ledger_version TEXT NOT NULL DEFAULT '1.0',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vauto_payment_intents_transaction UNIQUE (transaction_id),
  CONSTRAINT uq_vauto_payment_intents_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_vauto_payment_intents_buyer
  ON vauto_payment_intents (buyer_id);

CREATE INDEX IF NOT EXISTS idx_vauto_payment_intents_seller
  ON vauto_payment_intents (seller_id);

CREATE INDEX IF NOT EXISTS idx_vauto_payment_intents_status
  ON vauto_payment_intents (status);

CREATE TABLE IF NOT EXISTS vauto_payment_ledger (
  id                     TEXT PRIMARY KEY,
  payment_intent_id      TEXT NOT NULL REFERENCES vauto_payment_intents (id) ON DELETE RESTRICT,
  transaction_id         TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE RESTRICT,
  entry_type             TEXT NOT NULL CHECK (
    entry_type IN (
      'DEBIT',
      'CREDIT',
      'FEE',
      'ESCROW_HOLD',
      'ESCROW_RELEASE',
      'REFUND'
    )
  ),
  amount_cents           INTEGER NOT NULL CHECK (amount_cents > 0),
  running_balance_cents  INTEGER NOT NULL,
  currency               TEXT NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  actor_id               TEXT NOT NULL,
  idempotency_key        TEXT NOT NULL,
  entry_hash             TEXT NOT NULL,
  payload_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vauto_payment_ledger_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_vauto_payment_ledger_intent
  ON vauto_payment_ledger (payment_intent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_vauto_payment_ledger_transaction
  ON vauto_payment_ledger (transaction_id, created_at);

-- Append-only ledger: forbid UPDATE / DELETE at DB level.
CREATE OR REPLACE FUNCTION vauto_payment_ledger_forbid_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'vauto_payment_ledger is append-only (no UPDATE/DELETE)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vauto_payment_ledger_no_update ON vauto_payment_ledger;
CREATE TRIGGER trg_vauto_payment_ledger_no_update
  BEFORE UPDATE ON vauto_payment_ledger
  FOR EACH ROW
  EXECUTE PROCEDURE vauto_payment_ledger_forbid_mutation();

DROP TRIGGER IF EXISTS trg_vauto_payment_ledger_no_delete ON vauto_payment_ledger;
CREATE TRIGGER trg_vauto_payment_ledger_no_delete
  BEFORE DELETE ON vauto_payment_ledger
  FOR EACH ROW
  EXECUTE PROCEDURE vauto_payment_ledger_forbid_mutation();

-- Payment intents: forbid DELETE; forbid mutation of financial identity columns.
CREATE OR REPLACE FUNCTION vauto_payment_intents_forbid_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'vauto_payment_intents rows cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vauto_payment_intents_guard_update()
RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
     OR NEW.deal_snapshot_id IS DISTINCT FROM OLD.deal_snapshot_id
     OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.payment_ledger_version IS DISTINCT FROM OLD.payment_ledger_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'vauto_payment_intents financial identity columns are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vauto_payment_intents_no_delete ON vauto_payment_intents;
CREATE TRIGGER trg_vauto_payment_intents_no_delete
  BEFORE DELETE ON vauto_payment_intents
  FOR EACH ROW
  EXECUTE PROCEDURE vauto_payment_intents_forbid_delete();

DROP TRIGGER IF EXISTS trg_vauto_payment_intents_guard_update ON vauto_payment_intents;
CREATE TRIGGER trg_vauto_payment_intents_guard_update
  BEFORE UPDATE ON vauto_payment_intents
  FOR EACH ROW
  EXECUTE PROCEDURE vauto_payment_intents_guard_update();
