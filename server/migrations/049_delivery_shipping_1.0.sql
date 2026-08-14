-- Stage 11G.1 — Delivery & Shipping Integration 1.0
-- Links carrier tracking to 11A SM (PAID → SHIPPING_PENDING → SHIPPED → DELIVERED).
-- DELIVERED is the authoritative gate for 11F.4 releaseToSeller eligibility.

CREATE TABLE IF NOT EXISTS vauto_deliveries (
  id                          TEXT PRIMARY KEY,
  transaction_id              TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE RESTRICT,
  carrier                     TEXT NOT NULL
    CHECK (carrier IN ('OMNIVA', 'DPD', 'LP_EXPRESS', 'DIRECT_COURIER')),
  tracking_code               TEXT NOT NULL,
  terminal_id                 TEXT NULL,
  shipping_fee_cents          INTEGER NOT NULL DEFAULT 0
    CHECK (shipping_fee_cents >= 0),
  status                      TEXT NOT NULL DEFAULT 'PENDING_LABEL'
    CHECK (
      status IN (
        'PENDING_LABEL',
        'LABEL_CREATED',
        'IN_TRANSIT',
        'DELIVERED',
        'FAILED_DELIVERY'
      )
    ),
  carrier_label_id            TEXT NULL,
  tracking_url                TEXT NULL,
  delivery_integration_version TEXT NOT NULL DEFAULT '1.0',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vauto_deliveries_transaction UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_vauto_deliveries_tracking
  ON vauto_deliveries (tracking_code);

CREATE INDEX IF NOT EXISTS idx_vauto_deliveries_status
  ON vauto_deliveries (status);

-- Tracking code immutable after label created (cannot swap tracking mid-flight).
CREATE OR REPLACE FUNCTION vauto_deliveries_guard_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.tracking_code IS DISTINCT FROM NEW.tracking_code
     AND OLD.status NOT IN ('PENDING_LABEL') THEN
    RAISE EXCEPTION 'vauto_deliveries tracking_code is immutable after label creation';
  END IF;
  IF OLD.carrier IS DISTINCT FROM NEW.carrier
     AND OLD.status NOT IN ('PENDING_LABEL') THEN
    RAISE EXCEPTION 'vauto_deliveries carrier is immutable after label creation';
  END IF;
  IF OLD.transaction_id IS DISTINCT FROM NEW.transaction_id THEN
    RAISE EXCEPTION 'vauto_deliveries transaction_id is immutable';
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vauto_deliveries_guard_update ON vauto_deliveries;
CREATE TRIGGER trg_vauto_deliveries_guard_update
  BEFORE UPDATE ON vauto_deliveries
  FOR EACH ROW
  EXECUTE PROCEDURE vauto_deliveries_guard_update();
