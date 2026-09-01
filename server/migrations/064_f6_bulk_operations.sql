-- F6.2 — durable professional-seller bulk operations.
-- Additive ONLY (new tables, indexes, constraints). No Stage 11 / payments /
-- ledger / webhook / VIN table is touched. Idempotent by repo standard
-- (CREATE ... IF NOT EXISTS), applied once via schema_migrations.

-- One row per (actor, operation, idempotency key) — the UNIQUE constraint is
-- the atomic claim: exactly one concurrent caller can INSERT the row; every
-- replay sees the existing row and reads the saved result instead of running.
CREATE TABLE IF NOT EXISTS vauto_bulk_operations (
  id               TEXT PRIMARY KEY,
  actor_id         TEXT NOT NULL,
  operation        TEXT NOT NULL CHECK (operation IN ('hide', 'republish')),
  idempotency_key  TEXT NOT NULL,
  proposal_digest  TEXT NOT NULL,
  target_image     JSONB NOT NULL,
  state            TEXT NOT NULL CHECK (
    state IN ('PENDING', 'EXECUTING', 'COMPLETED', 'PARTIAL', 'FAILED', 'RECOVERY_REQUIRED')
  ),
  result_json      JSONB,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_id, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_bulk_ops_actor
  ON vauto_bulk_operations (actor_id, created_at DESC);

-- Per-target state + outcome. (operation_id, listing_id) is the natural key;
-- foreign/not-found targets are never materialized here (audit only).
CREATE TABLE IF NOT EXISTS vauto_bulk_operation_items (
  operation_id   TEXT NOT NULL,
  listing_id     TEXT NOT NULL,
  state          TEXT NOT NULL CHECK (state IN ('PENDING', 'APPLIED', 'FAILED', 'SKIPPED')),
  outcome        TEXT NOT NULL,
  detail         TEXT,
  applied_at     TIMESTAMPTZ,
  PRIMARY KEY (operation_id, listing_id)
);

-- Append-only audit trail. actor/action/outcome/digest/correlation are
-- server-derived; clients can never supply or overwrite them.
CREATE TABLE IF NOT EXISTS vauto_bulk_audit_entries (
  id              BIGSERIAL PRIMARY KEY,
  operation_id    TEXT NOT NULL,
  actor_id        TEXT NOT NULL,
  action          TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  proposal_digest TEXT NOT NULL,
  correlation     TEXT NOT NULL,
  outcome         TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_audit_operation
  ON vauto_bulk_audit_entries (operation_id, created_at);
