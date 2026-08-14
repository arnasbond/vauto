-- Stage 11F.4 — Funds transfer / fee / refund semantics 1.0
-- Stripe Connect Separate Charges and Transfers (no fake bank escrow).
-- HELD_IN_ESCROW remains an internal VAUTO product marker ("Pinigai laikomi iki sandorio užbaigimo").

ALTER TABLE vauto_payment_intents
  ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER NOT NULL DEFAULT 0
    CHECK (platform_fee_cents >= 0);

ALTER TABLE vauto_payment_intents
  ADD COLUMN IF NOT EXISTS seller_net_cents INTEGER NOT NULL DEFAULT 0
    CHECK (seller_net_cents >= 0);

ALTER TABLE vauto_payment_intents
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT NULL;

ALTER TABLE vauto_payment_intents
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT NULL;

ALTER TABLE vauto_payment_intents
  ADD COLUMN IF NOT EXISTS transfer_status TEXT NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (
      transfer_status IN (
        'NOT_STARTED',
        'TRANSFER_PENDING',
        'TRANSFERRED',
        'TRANSFER_BLOCKED',
        'REFUNDED'
      )
    );

-- Fee split invariant: unset (0+0) OR exact gross = fee + net
ALTER TABLE vauto_payment_intents
  DROP CONSTRAINT IF EXISTS chk_vauto_payment_intents_fee_split;

ALTER TABLE vauto_payment_intents
  ADD CONSTRAINT chk_vauto_payment_intents_fee_split
  CHECK (
    (platform_fee_cents = 0 AND seller_net_cents = 0)
    OR (platform_fee_cents + seller_net_cents = amount_cents)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_vauto_payment_intents_stripe_transfer_id
  ON vauto_payment_intents (stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vauto_payment_intents_stripe_refund_id
  ON vauto_payment_intents (stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;

-- Expand ledger entry_type allowlist (keep legacy 11F.1–11F.3 types).
ALTER TABLE vauto_payment_ledger
  DROP CONSTRAINT IF EXISTS vauto_payment_ledger_entry_type_check;

ALTER TABLE vauto_payment_ledger
  ADD CONSTRAINT vauto_payment_ledger_entry_type_check
  CHECK (
    entry_type IN (
      'DEBIT',
      'CREDIT',
      'FEE',
      'ESCROW_HOLD',
      'ESCROW_RELEASE',
      'REFUND',
      'BUYER_PAYMENT_RECEIVED',
      'PLATFORM_FEE_RESERVED',
      'SELLER_TRANSFER_PENDING',
      'SELLER_TRANSFERRED',
      'BUYER_REFUND_PENDING',
      'BUYER_REFUNDED',
      'TRANSFER_REVERSED'
    )
  );
