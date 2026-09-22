-- E1 — Core v2 state and result context persistence.
-- Adds durable Postgres columns for Core v2 provenance-aware marketplace state
-- and grounded result context (listing IDs for reference continuity).
ALTER TABLE agent_threads
  ADD COLUMN IF NOT EXISTS core_v2_state JSONB,
  ADD COLUMN IF NOT EXISTS core_v2_result_context JSONB;
