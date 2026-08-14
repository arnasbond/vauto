-- Stage 11G.4 — Stale PROCESSING lease recovery for seller_release_jobs.
-- processing_started_at enables reclaim of crashed workers (>5 minutes).

ALTER TABLE seller_release_jobs
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_seller_release_jobs_stale_processing
  ON seller_release_jobs (status, processing_started_at)
  WHERE status = 'PROCESSING';

-- Status domain remains: PENDING | PROCESSING | COMPLETED | FAILED
-- (enforced by existing CHECK on seller_release_jobs.status).
