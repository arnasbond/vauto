-- Service leads (paslaugų pay-per-lead pipeline)
CREATE TABLE IF NOT EXISTS service_leads (
  id                    TEXT PRIMARY KEY,
  source_user_id        TEXT REFERENCES users (id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  city                  TEXT NOT NULL,
  category              TEXT NOT NULL,
  summary               TEXT NOT NULL,
  urgency               TEXT NOT NULL DEFAULT 'flexible'
    CHECK (urgency IN ('today', 'this_week', 'flexible')),
  budget_hint           TEXT NOT NULL DEFAULT 'Sutarti',
  lead_price            NUMERIC(12, 2) NOT NULL DEFAULT 1.2,
  hidden_contact        TEXT NOT NULL,
  contact_phone         TEXT NOT NULL,
  required_specialties  TEXT[] NOT NULL DEFAULT '{}',
  query_text            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_leads_city ON service_leads (city, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_leads_created ON service_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_leads_source ON service_leads (source_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS service_lead_opens (
  lead_id     TEXT NOT NULL REFERENCES service_leads (id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  price_paid  NUMERIC(12, 2) NOT NULL,
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_service_lead_opens_provider
  ON service_lead_opens (provider_id, opened_at DESC);

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check
  CHECK (kind IN ('top_up', 'promote', 'refund', 'service_lead'));
