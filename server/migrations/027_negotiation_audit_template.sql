-- Phase C twin audit: template id + escalate query indexes
ALTER TABLE negotiation_audit_log
  ADD COLUMN IF NOT EXISTS template_id TEXT;

CREATE INDEX IF NOT EXISTS idx_negotiation_audit_listing
  ON negotiation_audit_log (listing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_negotiation_audit_escalated
  ON negotiation_audit_log (escalated, created_at DESC)
  WHERE escalated = TRUE;
