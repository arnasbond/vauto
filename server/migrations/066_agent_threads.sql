-- E1 — server-authoritative agent conversation threads.
-- PREPARED ONLY — NOT applied to any environment yet. The runtime store
-- remains the transitional in-memory adapter until this migration is
-- reviewed; no destructive operations.
CREATE TABLE IF NOT EXISTS agent_threads (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  anon_session_token_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_turn_id TEXT,
  listing_draft JSONB,
  listing_flow_state TEXT,
  search_context JSONB,
  pending_confirmations JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_intent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_threads_owner_idx ON agent_threads (owner_user_id);
CREATE INDEX IF NOT EXISTS agent_threads_anon_idx ON agent_threads (anon_session_token_hash);
