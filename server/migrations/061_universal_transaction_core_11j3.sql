-- Stage 11J.3 — provider event / payment-intent uniqueness (replay prevention).
-- Applied after 060.

CREATE UNIQUE INDEX IF NOT EXISTS idx_vauto_obligations_provider_event
  ON vauto_financial_obligations (payment_provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vauto_obligations_provider_ref_primary
  ON vauto_financial_obligations (payment_provider, payment_provider_ref)
  WHERE payment_provider_ref IS NOT NULL
    AND type IN ('PURCHASE_PRICE', 'RESERVATION_DEPOSIT', 'SERVICE_DEPOSIT');
