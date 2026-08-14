-- Stage 10L — outbox processing lease + real user.created_at for seller trust.

ALTER TABLE ai_watch_outbox
  ADD COLUMN IF NOT EXISTS processing_since TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_ai_watch_outbox_stale_processing
  ON ai_watch_outbox (processing_since)
  WHERE status = 'processing';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NULL;

-- New signups get a real created_at; existing rows stay NULL (unknown ≠ invent age).
COMMENT ON COLUMN users.created_at IS
  'Account creation time for Stage 10 seller trust. NULL = unknown (do not invent age).';
