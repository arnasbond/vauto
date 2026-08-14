-- Stage 11E — Deal Room 1.0 immutable agreement snapshots.
-- Deal Room is a READ MODEL + action orchestration surface — NOT a new state authority.

CREATE TABLE IF NOT EXISTS vauto_deal_snapshots (
  id                       TEXT PRIMARY KEY,
  transaction_id           TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE CASCADE,
  accepted_offer_id        TEXT NOT NULL REFERENCES vauto_offers (id),
  amount_cents             INTEGER NOT NULL CHECK (amount_cents > 0),
  currency                 TEXT NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  listing_id               TEXT NOT NULL,
  listing_title            TEXT NOT NULL,
  listing_attributes_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  listing_primary_image    TEXT NULL,
  buyer_id                 TEXT NOT NULL,
  seller_id                TEXT NOT NULL,
  snapshot_hash            TEXT NOT NULL,
  deal_room_version        TEXT NOT NULL DEFAULT '1.0',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vauto_deal_snapshots_transaction UNIQUE (transaction_id),
  CONSTRAINT uq_vauto_deal_snapshots_accepted_offer UNIQUE (accepted_offer_id)
);

CREATE INDEX IF NOT EXISTS idx_vauto_deal_snapshots_listing
  ON vauto_deal_snapshots (listing_id);

CREATE INDEX IF NOT EXISTS idx_vauto_deal_snapshots_buyer
  ON vauto_deal_snapshots (buyer_id);

CREATE INDEX IF NOT EXISTS idx_vauto_deal_snapshots_seller
  ON vauto_deal_snapshots (seller_id);

-- Immutable: forbid UPDATE / DELETE at DB level.
CREATE OR REPLACE FUNCTION vauto_deal_snapshots_forbid_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'vauto_deal_snapshots is immutable (no UPDATE/DELETE)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vauto_deal_snapshots_no_update ON vauto_deal_snapshots;
CREATE TRIGGER trg_vauto_deal_snapshots_no_update
  BEFORE UPDATE ON vauto_deal_snapshots
  FOR EACH ROW
  EXECUTE PROCEDURE vauto_deal_snapshots_forbid_mutation();

DROP TRIGGER IF EXISTS trg_vauto_deal_snapshots_no_delete ON vauto_deal_snapshots;
CREATE TRIGGER trg_vauto_deal_snapshots_no_delete
  BEFORE DELETE ON vauto_deal_snapshots
  FOR EACH ROW
  EXECUTE PROCEDURE vauto_deal_snapshots_forbid_mutation();
