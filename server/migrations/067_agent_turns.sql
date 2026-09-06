-- E1.3/E1.4 — server-authoritative agent turn ledger (exactly-once semantics).
-- PREPARED ONLY — NOT applied to any environment yet. DB-level uniqueness of
-- (thread_id, turn_id) is enforced by the composite primary key.
CREATE TABLE IF NOT EXISTS agent_turns (
  thread_id TEXT NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN (
      'reserved',
      'running',
      'completed',
      'failed_before_execution',
      'indeterminate'
    )),
  user_text TEXT NOT NULL,
  assistant_reply TEXT,
  response_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, turn_id)
);

CREATE INDEX IF NOT EXISTS agent_turns_status_idx ON agent_turns (status);
