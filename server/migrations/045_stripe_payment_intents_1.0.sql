-- Stage 11F.2 — Stripe PaymentIntent Integration 1.0 (PSP adapter columns).
-- VAUTO DB remains domain authority. No webhooks / PAID transitions in this migration.

ALTER TABLE vauto_payment_intents
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT NULL;

ALTER TABLE vauto_payment_intents
  ADD COLUMN IF NOT EXISTS stripe_client_secret TEXT NULL;

ALTER TABLE vauto_payment_intents
  ADD COLUMN IF NOT EXISTS provider_status TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vauto_payment_intents_stripe_id
  ON vauto_payment_intents (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
