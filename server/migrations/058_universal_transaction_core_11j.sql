-- Stage 11J — Universal Transaction Core (policy-driven, multi-vertical).
-- Enumerated domains as TEXT + CHECK (same pattern as 11A–11I; PGlite-safe).
-- Defaults preserve legacy GOODS + CARRIER_DELIVERY + FULL_ESCROW.

-- Expand status domain with fulfillment-specific states (no inbound on carrier path).
ALTER TABLE vauto_transactions DROP CONSTRAINT IF EXISTS vauto_transactions_status_check;
ALTER TABLE vauto_transactions
  ADD CONSTRAINT vauto_transactions_status_check
  CHECK (status IN (
    'DISCUSSION', 'OFFER_PENDING', 'NEGOTIATING', 'AGREED',
    'PAYMENT_PENDING', 'PAID', 'SHIPPING_PENDING', 'SHIPPED',
    'DELIVERED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DISPUTED',
    'SERVICE_SCHEDULED', 'SERVICE_PERFORMED', 'CUSTOMER_CONFIRMED',
    'CONTACT_ACCEPTED', 'INTERACTION_COMPLETED'
  ));

ALTER TABLE vauto_transactions
  ADD COLUMN IF NOT EXISTS vertical TEXT NOT NULL DEFAULT 'GOODS';

ALTER TABLE vauto_transactions
  ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'CARRIER_DELIVERY';

ALTER TABLE vauto_transactions
  ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'FULL_ESCROW';

ALTER TABLE vauto_transactions
  ADD COLUMN IF NOT EXISTS verification_policy TEXT NOT NULL DEFAULT 'PLATFORM_TRANSACTION';

ALTER TABLE vauto_transactions
  ADD COLUMN IF NOT EXISTS contract_value_cents BIGINT NULL;

ALTER TABLE vauto_transactions
  ADD COLUMN IF NOT EXISTS platform_managed_amount_cents BIGINT NOT NULL DEFAULT 0;

ALTER TABLE vauto_transactions DROP CONSTRAINT IF EXISTS vauto_transactions_vertical_check;
ALTER TABLE vauto_transactions
  ADD CONSTRAINT vauto_transactions_vertical_check
  CHECK (vertical IN ('GOODS', 'SERVICES', 'REAL_ESTATE', 'JOBS'));

ALTER TABLE vauto_transactions DROP CONSTRAINT IF EXISTS vauto_transactions_fulfillment_type_check;
ALTER TABLE vauto_transactions
  ADD CONSTRAINT vauto_transactions_fulfillment_type_check
  CHECK (fulfillment_type IN (
    'CARRIER_DELIVERY', 'LOCAL_HANDOFF', 'SERVICE_IN_PERSON',
    'SERVICE_REMOTE', 'DIRECT_CONTACT'
  ));

ALTER TABLE vauto_transactions DROP CONSTRAINT IF EXISTS vauto_transactions_payment_mode_check;
ALTER TABLE vauto_transactions
  ADD CONSTRAINT vauto_transactions_payment_mode_check
  CHECK (payment_mode IN (
    'FULL_ESCROW', 'DEPOSIT_ESCROW', 'PLATFORM_FEE_ONLY', 'OFF_PLATFORM'
  ));

ALTER TABLE vauto_transactions DROP CONSTRAINT IF EXISTS vauto_transactions_verification_policy_check;
ALTER TABLE vauto_transactions
  ADD CONSTRAINT vauto_transactions_verification_policy_check
  CHECK (verification_policy IN (
    'PLATFORM_TRANSACTION', 'MUTUAL_COMPLETION',
    'APPOINTMENT_VERIFIED', 'NO_VERIFIED_REVIEW'
  ));

ALTER TABLE vauto_transactions DROP CONSTRAINT IF EXISTS vauto_transactions_managed_amount_check;
ALTER TABLE vauto_transactions
  ADD CONSTRAINT vauto_transactions_managed_amount_check
  CHECK (
    platform_managed_amount_cents >= 0
    AND (
      contract_value_cents IS NULL
      OR platform_managed_amount_cents <= contract_value_cents
    )
  );

CREATE INDEX IF NOT EXISTS idx_vauto_transactions_vertical
  ON vauto_transactions (vertical, fulfillment_type);

CREATE TABLE IF NOT EXISTS vauto_financial_obligations (
  id                    TEXT PRIMARY KEY,
  transaction_id        TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE RESTRICT,
  type                  TEXT NOT NULL
    CHECK (type IN (
      'PURCHASE_PRICE', 'RESERVATION_DEPOSIT', 'SERVICE_DEPOSIT',
      'PLATFORM_FEE', 'REFUND', 'PAYOUT'
    )),
  amount_cents          BIGINT NOT NULL CHECK (amount_cents > 0),
  currency              VARCHAR(3) NOT NULL DEFAULT 'EUR',
  payer_id              TEXT NOT NULL,
  beneficiary_id        TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'CREATED'
    CHECK (status IN (
      'CREATED', 'HELD', 'CAPTURED', 'RELEASED', 'REFUNDED', 'CANCELLED'
    )),
  payment_provider_ref  TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_vauto_fin_obl_parties CHECK (payer_id <> beneficiary_id)
);

CREATE INDEX IF NOT EXISTS idx_vauto_financial_obligations_txn
  ON vauto_financial_obligations (transaction_id, created_at);

-- 057 creates vauto_reviews; skip if reputation migration not applied yet.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'vauto_reviews'
  ) THEN
    ALTER TABLE vauto_reviews
      ADD COLUMN IF NOT EXISTS verification_level TEXT NOT NULL DEFAULT 'L1_PLATFORM_TRANSACTION';
    ALTER TABLE vauto_reviews DROP CONSTRAINT IF EXISTS vauto_reviews_verification_level_check;
    ALTER TABLE vauto_reviews
      ADD CONSTRAINT vauto_reviews_verification_level_check
      CHECK (verification_level IN (
        'L1_PLATFORM_TRANSACTION', 'L2_INTERACTION', 'L3_CONTRACT', 'L0_UNVERIFIED'
      ));
  END IF;
END
$$;
