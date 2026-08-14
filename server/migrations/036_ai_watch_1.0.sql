-- AI Watch 1.0 — PostgreSQL (Stage 10J/10K production migration)
-- Fingerprint unique constraint enforces race-safe notification idempotency.
-- Outbox + (rule_id, user_id) ownership FK added in 10K.

CREATE TABLE IF NOT EXISTS ai_watches (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('SEARCH_WATCH', 'LISTING_PRICE_WATCH')),
  status        TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED', 'DISABLED', 'DELETED')),
  structured_query JSONB NOT NULL,
  target_listing_id TEXT NULL,
  thresholds    JSONB NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_evaluated_at TIMESTAMPTZ NULL,
  last_notified_at  TIMESTAMPTZ NULL,
  watch_version TEXT NOT NULL DEFAULT '1.0',
  CONSTRAINT ai_watches_user_isolation CHECK (user_id <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_watches_id_user
  ON ai_watches (id, user_id);

CREATE INDEX IF NOT EXISTS idx_ai_watches_user_status
  ON ai_watches (user_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_watches_prefilter_category
  ON ai_watches ((structured_query->>'category'))
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS ai_watch_notifications (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rule_id            TEXT NOT NULL,
  listing_id         TEXT NOT NULL,
  event_fingerprint  TEXT NOT NULL,
  title              TEXT NOT NULL,
  body               TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  watch_version      TEXT NOT NULL DEFAULT '1.0',
  CONSTRAINT ai_watch_notifications_user_isolation CHECK (user_id <> ''),
  CONSTRAINT ai_watch_notifications_owner_fk
    FOREIGN KEY (rule_id, user_id) REFERENCES ai_watches (id, user_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_watch_notif_fingerprint
  ON ai_watch_notifications (user_id, event_fingerprint);

CREATE INDEX IF NOT EXISTS idx_ai_watch_notif_user_day
  ON ai_watch_notifications (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_watch_notif_rule_listing
  ON ai_watch_notifications (user_id, rule_id, listing_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_watch_outbox (
  id            TEXT PRIMARY KEY,
  event_type    TEXT NOT NULL CHECK (event_type IN (
    'listing_created', 'listing_updated', 'price_changed', 'status_changed'
  )),
  listing_id    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  available_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ NULL,
  last_error    TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_watch_outbox_pending
  ON ai_watch_outbox (status, available_at, created_at)
  WHERE status IN ('pending', 'processing');
