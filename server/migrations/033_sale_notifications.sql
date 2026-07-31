-- Post-sale email log. `event_key` is the idempotency key so Stripe webhook
-- retries and duplicate PATCH requests cannot send the same email twice.
CREATE TABLE IF NOT EXISTS sale_notifications (
  id            TEXT PRIMARY KEY,
  event_key     TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL,
  listing_id    TEXT,
  escrow_id     TEXT,
  seller_id     TEXT,
  buyer_id      TEXT,
  recipients    JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending',
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN sale_notifications.event_key IS 'Idempotency key, e.g. listing_sold:<listingId> or escrow_paid:<escrowId>';
COMMENT ON COLUMN sale_notifications.status IS 'pending | sent | skipped | failed';

CREATE INDEX IF NOT EXISTS idx_sale_notifications_seller
  ON sale_notifications (seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sale_notifications_status
  ON sale_notifications (status)
  WHERE status <> 'sent';
