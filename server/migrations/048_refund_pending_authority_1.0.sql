-- Stage 11F.6 — REFUND_PENDING finality + transfer_status expansion.
-- Refund is not final until Stripe status === 'succeeded' (or signed webhook).

ALTER TABLE vauto_payment_intents
  DROP CONSTRAINT IF EXISTS vauto_payment_intents_status_check;

ALTER TABLE vauto_payment_intents
  ADD CONSTRAINT vauto_payment_intents_status_check
  CHECK (
    status IN (
      'CREATED',
      'AUTHORIZING',
      'HELD_IN_ESCROW',
      'RELEASED_TO_SELLER',
      'REFUND_PENDING',
      'REFUNDED',
      'FAILED'
    )
  );

ALTER TABLE vauto_payment_intents
  DROP CONSTRAINT IF EXISTS vauto_payment_intents_transfer_status_check;

ALTER TABLE vauto_payment_intents
  ADD CONSTRAINT vauto_payment_intents_transfer_status_check
  CHECK (
    transfer_status IN (
      'NOT_STARTED',
      'TRANSFER_PENDING',
      'TRANSFERRED',
      'TRANSFER_BLOCKED',
      'REFUND_PENDING',
      'REFUNDED'
    )
  );
