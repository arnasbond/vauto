-- Escrow monetization: Stripe Connect hold, buyer protection fee, shipping foundation

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;

ALTER TABLE escrow_transactions DROP CONSTRAINT IF EXISTS escrow_transactions_status_check;

ALTER TABLE escrow_transactions
  ADD COLUMN IF NOT EXISTS buyer_protection_fee NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS buyer_total NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS shipping_label_id TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS buyer_confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shipping_provider TEXT,
  ADD COLUMN IF NOT EXISTS shipping_locker_id TEXT,
  ADD COLUMN IF NOT EXISTS shipping_locker_name TEXT,
  ADD COLUMN IF NOT EXISTS express_escrow_24h BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivered_to_locker_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS courier_status TEXT,
  ADD COLUMN IF NOT EXISTS courier_provider TEXT;

ALTER TABLE escrow_transactions
  ADD CONSTRAINT escrow_transactions_status_check
  CHECK (status IN (
    'offered','paying','paid','label_sent','shipped','delivered',
    'completed','disputed','cancelled'
  ));

CREATE INDEX IF NOT EXISTS idx_escrow_stripe_pi
  ON escrow_transactions (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_escrow_delivery
  ON escrow_transactions (delivery_status, buyer_confirmed);
