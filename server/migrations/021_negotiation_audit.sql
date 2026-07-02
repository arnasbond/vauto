CREATE TABLE IF NOT EXISTS negotiation_audit_log (
  id BIGSERIAL PRIMARY KEY,
  thread_id TEXT,
  listing_id TEXT,
  seller_user_id TEXT,
  buyer_message TEXT NOT NULL,
  auto_reply TEXT,
  offered_price NUMERIC,
  counter_price NUMERIC,
  deal_ready BOOLEAN DEFAULT FALSE,
  escalated BOOLEAN DEFAULT FALSE,
  escalate_reason TEXT,
  rule_applied TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_negotiation_audit_seller
  ON negotiation_audit_log (seller_user_id, created_at DESC);
