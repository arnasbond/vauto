/**
 * SQL migration for AI Watch tables — PostgreSQL.
 * Canonical file: server/migrations/036_ai_watch_1.0.sql (applied by migrate.ts).
 */

export const AI_WATCH_MIGRATION_SQL = `
-- AI Watch 1.0 schema
CREATE TABLE IF NOT EXISTS ai_watches (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_ai_watches_user_status
  ON ai_watches (user_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_watches_prefilter_category
  ON ai_watches ((structured_query->>'category'))
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS ai_watch_notifications (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  rule_id            TEXT NOT NULL REFERENCES ai_watches(id),
  listing_id         TEXT NOT NULL,
  event_fingerprint  TEXT NOT NULL,
  title              TEXT NOT NULL,
  body               TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  watch_version      TEXT NOT NULL DEFAULT '1.0',
  CONSTRAINT ai_watch_notifications_user_isolation CHECK (user_id <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_watch_notif_fingerprint
  ON ai_watch_notifications (user_id, event_fingerprint);

CREATE INDEX IF NOT EXISTS idx_ai_watch_notif_user_day
  ON ai_watch_notifications (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_watch_notif_rule_listing
  ON ai_watch_notifications (user_id, rule_id, listing_id, created_at DESC);
`;

export const AI_WATCH_MIGRATION_ID = "036_ai_watch_1.0";
