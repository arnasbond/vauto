-- Stage 11J.1 — concurrency, dual-party interaction, status expansion.
-- Applied after 058. Fresh PGlite tests run 058 then 059.

ALTER TABLE vauto_transactions DROP CONSTRAINT IF EXISTS vauto_transactions_status_check;
ALTER TABLE vauto_transactions
  ADD CONSTRAINT vauto_transactions_status_check
  CHECK (status IN (
    'DISCUSSION', 'OFFER_PENDING', 'NEGOTIATING', 'AGREED',
    'PAYMENT_PENDING', 'PAID', 'SHIPPING_PENDING', 'SHIPPED',
    'DELIVERED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DISPUTED',
    'SERVICE_SCHEDULED', 'SERVICE_PERFORMED', 'CUSTOMER_CONFIRMED',
    'CONTACT_ACCEPTED', 'INTERACTION_CLAIMED', 'INTERACTION_CONFIRMED',
    'INTERACTION_COMPLETED'
  ));

ALTER TABLE vauto_transactions
  ADD COLUMN IF NOT EXISTS interaction_claimed_by TEXT NULL;

ALTER TABLE vauto_financial_obligations
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL;

ALTER TABLE vauto_financial_obligations
  ADD COLUMN IF NOT EXISTS source_obligation_id TEXT NULL
    REFERENCES vauto_financial_obligations (id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vauto_fin_obl_txn_idempotency
  ON vauto_financial_obligations (transaction_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vauto_fin_obl_source_refund
  ON vauto_financial_obligations (source_obligation_id)
  WHERE type = 'REFUND' AND source_obligation_id IS NOT NULL;
