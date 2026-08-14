-- Stage 11F.3 — Stripe Signed Webhooks 1.0 (durable inbox).
-- No payout / escrow release / refund execution in this migration.

CREATE TABLE IF NOT EXISTS vauto_stripe_webhook_events (
  id                 TEXT PRIMARY KEY,
  stripe_event_id    TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  stripe_object_id   TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
  payload_hash       TEXT NOT NULL,
  attempts           INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error         TEXT NULL,
  livemode           BOOLEAN NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at       TIMESTAMPTZ NULL,
  CONSTRAINT uq_vauto_stripe_webhook_events_stripe_event_id UNIQUE (stripe_event_id)
);

CREATE INDEX IF NOT EXISTS idx_vauto_stripe_webhook_events_status_created
  ON vauto_stripe_webhook_events (status, created_at);
