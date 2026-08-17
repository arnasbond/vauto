-- Stage 11J.2 — payment provider provenance + create idempotency fingerprint.
-- Applied after 059. Fresh PGlite tests run 058, 059, then 060.

ALTER TABLE vauto_financial_obligations
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NULL;

ALTER TABLE vauto_financial_obligations
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT NULL;

ALTER TABLE vauto_financial_obligations
  ADD COLUMN IF NOT EXISTS provider_verified_at TIMESTAMPTZ NULL;

ALTER TABLE vauto_transactions
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint TEXT NULL;
