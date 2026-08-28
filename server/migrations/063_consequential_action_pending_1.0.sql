-- VAUTO AI Maturity — Phase 1: Consequential Action Confirmation Boundary.
-- Durable pending-action / idempotency bookkeeping ONLY (audit remediation #3).
--
-- This table stores the confirmation-boundary state machine for
-- markListingSold / blockListing proposals (see
-- server/src/ai/confirmation/consequential-action-policy.ts). It never
-- stores listing/financial data itself and is intentionally isolated from
-- Stage 11 transaction/payment tables — dropping this table loses in-flight
-- confirmations only, never money or listing state.

CREATE TABLE IF NOT EXISTS vauto_consequential_pending_actions (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL CHECK (type IN ('markListingSold', 'blockListing')),
  target_id      TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  explanation    TEXT NOT NULL,
  state          TEXT NOT NULL CHECK (
    state IN ('PENDING', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED')
  ),
  result_json    JSONB,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  executing_at   TIMESTAMPTZ,
  -- Fencing token (3rd audit remediation) — minted fresh on every successful
  -- PENDING->EXECUTING claim AND on every stale-lease reclaim. `complete()`
  -- requires an exact match on this column, so an old executor whose lease
  -- was reclaimed while it was still (slowly) running can never terminalize
  -- a lease it no longer owns — see consequential-action-policy.ts.
  execution_token TEXT,
  terminal_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vauto_consequential_pending_user
  ON vauto_consequential_pending_actions (user_id);

-- Cheap periodic cleanup of long-terminal rows (best-effort; the row's own
-- expires_at already makes stale PENDING rows unusable).
CREATE INDEX IF NOT EXISTS idx_vauto_consequential_pending_expires
  ON vauto_consequential_pending_actions (expires_at);
