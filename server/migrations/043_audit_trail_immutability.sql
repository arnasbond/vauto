-- Stage 11E.1 — Audit trail immutability (H-03).
-- Append-only: forbid UPDATE/DELETE; remove ON DELETE CASCADE from audit FKs.

-- Recreate FKs without CASCADE (RESTRICT / NO ACTION).
ALTER TABLE vauto_transaction_audit
  DROP CONSTRAINT IF EXISTS vauto_transaction_audit_transaction_id_fkey;

ALTER TABLE vauto_transaction_audit
  DROP CONSTRAINT IF EXISTS vauto_transaction_audit_event_id_fkey;

ALTER TABLE vauto_transaction_audit
  ADD CONSTRAINT vauto_transaction_audit_transaction_id_fkey
  FOREIGN KEY (transaction_id)
  REFERENCES vauto_transactions (id)
  ON DELETE RESTRICT;

ALTER TABLE vauto_transaction_audit
  ADD CONSTRAINT vauto_transaction_audit_event_id_fkey
  FOREIGN KEY (event_id)
  REFERENCES vauto_transaction_events (id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION vauto_transaction_audit_forbid_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vauto_transaction_audit_no_update ON vauto_transaction_audit;
CREATE TRIGGER trg_vauto_transaction_audit_no_update
  BEFORE UPDATE ON vauto_transaction_audit
  FOR EACH ROW
  EXECUTE PROCEDURE vauto_transaction_audit_forbid_mutation();

DROP TRIGGER IF EXISTS trg_vauto_transaction_audit_no_delete ON vauto_transaction_audit;
CREATE TRIGGER trg_vauto_transaction_audit_no_delete
  BEFORE DELETE ON vauto_transaction_audit
  FOR EACH ROW
  EXECUTE PROCEDURE vauto_transaction_audit_forbid_mutation();
