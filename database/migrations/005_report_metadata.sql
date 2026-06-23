ALTER TABLE support_reports ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_support_reports_updated
  ON support_reports ((metadata->>'updatedAt') DESC NULLS LAST);
