-- Stage 10K — outbox + notification ownership FK for DBs that already applied 036 base.

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_watches_id_user
  ON ai_watches (id, user_id);

-- Recreate notifications FK if older 036 only had rule_id REFERENCES ai_watches(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ai_watch_notifications_owner_fk'
  ) THEN
    ALTER TABLE ai_watch_notifications
      DROP CONSTRAINT IF EXISTS ai_watch_notifications_rule_id_fkey;
    ALTER TABLE ai_watch_notifications
      ADD CONSTRAINT ai_watch_notifications_owner_fk
      FOREIGN KEY (rule_id, user_id) REFERENCES ai_watches (id, user_id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN
  -- best-effort on partial schemas
  NULL;
END $$;

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
