-- Phase 0: listing-level telemetry for Price / Logistics / B2B analytics.
-- Events are advisory analytics only — never gate AI dialogue or publish.
CREATE TABLE IF NOT EXISTS listing_events (
  id          TEXT PRIMARY KEY,
  listing_id  TEXT,
  user_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_events_type_created
  ON listing_events (type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_events_listing_created
  ON listing_events (listing_id, created_at DESC)
  WHERE listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listing_events_user_created
  ON listing_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
