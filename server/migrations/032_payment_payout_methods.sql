-- Saved payment method (buyer) + Stripe Connect payout account (seller).
-- SECURITY: only Stripe object ids and masked tails are stored here. Full card
-- numbers and full IBANs never touch VAUTO servers — Stripe holds them.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_method_brand TEXT,
  ADD COLUMN IF NOT EXISTS payment_method_last4 TEXT,
  ADD COLUMN IF NOT EXISTS payment_method_exp_month SMALLINT,
  ADD COLUMN IF NOT EXISTS payment_method_exp_year SMALLINT,
  ADD COLUMN IF NOT EXISTS payment_method_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_iban_last4 TEXT,
  ADD COLUMN IF NOT EXISTS payout_holder_name TEXT,
  ADD COLUMN IF NOT EXISTS payout_status TEXT,
  ADD COLUMN IF NOT EXISTS payout_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN users.payment_method_id IS 'Stripe PaymentMethod id (pm_...) attached to the customer';
COMMENT ON COLUMN users.payment_method_last4 IS 'Masked card tail for display only — never the full PAN';
COMMENT ON COLUMN users.payout_iban_last4 IS 'Masked IBAN tail from Stripe Connect external account — never the full IBAN';
COMMENT ON COLUMN users.payout_status IS 'none | pending | verified | restricted (mirrors Connect payouts_enabled)';

CREATE INDEX IF NOT EXISTS idx_users_payment_method
  ON users (payment_method_id)
  WHERE payment_method_id IS NOT NULL;
