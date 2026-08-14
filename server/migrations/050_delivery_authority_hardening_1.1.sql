-- Stage 11G.2 — Delivery authority & payout eligibility hardening (M-01).
-- Monotonic delivery status: PENDING_LABEL → LABEL_CREATED → IN_TRANSIT → DELIVERED.
-- FAILED_DELIVERY may be set from LABEL_CREATED / IN_TRANSIT only (not from DELIVERED).

CREATE OR REPLACE FUNCTION vauto_delivery_status_rank(s TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE s
    WHEN 'PENDING_LABEL' THEN 0
    WHEN 'LABEL_CREATED' THEN 1
    WHEN 'IN_TRANSIT' THEN 2
    WHEN 'DELIVERED' THEN 3
    WHEN 'FAILED_DELIVERY' THEN 2
    ELSE -1
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION vauto_deliveries_guard_update()
RETURNS TRIGGER AS $$
DECLARE
  old_rank INTEGER;
  new_rank INTEGER;
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

  -- M-01: forbid status regression (e.g. DELIVERED → IN_TRANSIT).
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    old_rank := vauto_delivery_status_rank(OLD.status);
    new_rank := vauto_delivery_status_rank(NEW.status);
    IF old_rank < 0 OR new_rank < 0 THEN
      RAISE EXCEPTION 'vauto_deliveries unknown status transition % → %', OLD.status, NEW.status;
    END IF;
    IF OLD.status = 'DELIVERED' AND NEW.status IS DISTINCT FROM 'DELIVERED' THEN
      RAISE EXCEPTION 'vauto_deliveries status regression forbidden: DELIVERED → %', NEW.status;
    END IF;
    IF NEW.status = 'FAILED_DELIVERY' THEN
      IF OLD.status NOT IN ('LABEL_CREATED', 'IN_TRANSIT', 'FAILED_DELIVERY') THEN
        RAISE EXCEPTION 'vauto_deliveries FAILED_DELIVERY not allowed from %', OLD.status;
      END IF;
    ELSIF NEW.status <> 'FAILED_DELIVERY' AND OLD.status <> 'FAILED_DELIVERY' THEN
      IF new_rank < old_rank THEN
        RAISE EXCEPTION 'vauto_deliveries status regression forbidden: % → %', OLD.status, NEW.status;
      END IF;
    ELSIF OLD.status = 'FAILED_DELIVERY' AND NEW.status <> 'FAILED_DELIVERY' THEN
      RAISE EXCEPTION 'vauto_deliveries status regression forbidden: FAILED_DELIVERY → %', NEW.status;
    END IF;
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
