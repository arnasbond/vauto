-- Stage 11H.3 — In-flight transfer execution lock (TOCTOU elimination).
-- TRANSFER_EXECUTING + execution_token reserved atomically BEFORE Stripe createTransfer.

ALTER TABLE vauto_payment_intents
  DROP CONSTRAINT IF EXISTS vauto_payment_intents_transfer_status_check;

ALTER TABLE vauto_payment_intents
  ADD CONSTRAINT vauto_payment_intents_transfer_status_check
  CHECK (
    transfer_status IN (
      'NOT_STARTED',
      'TRANSFER_PENDING',
      'TRANSFER_EXECUTING',
      'TRANSFERRED',
      'TRANSFER_BLOCKED',
      'REFUND_PENDING',
      'REFUNDED'
    )
  );

ALTER TABLE vauto_payment_intents
  ADD COLUMN IF NOT EXISTS execution_token TEXT NULL;

ALTER TABLE vauto_payment_intents
  ADD COLUMN IF NOT EXISTS execution_started_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vauto_payment_intents_execution_token
  ON vauto_payment_intents (execution_token)
  WHERE execution_token IS NOT NULL;

-- Optional mirror columns on durable release jobs (when table exists).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'seller_release_jobs'
  ) THEN
    ALTER TABLE seller_release_jobs
      ADD COLUMN IF NOT EXISTS execution_token TEXT NULL;
    ALTER TABLE seller_release_jobs
      ADD COLUMN IF NOT EXISTS execution_started_at TIMESTAMPTZ NULL;
  END IF;
END $$;
