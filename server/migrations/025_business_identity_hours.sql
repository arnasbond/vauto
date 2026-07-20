-- Business identity + working hours for VAUTO constitution (profile authority).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS company_code text,
  ADD COLUMN IF NOT EXISTS vat_code text,
  ADD COLUMN IF NOT EXISTS service_base_city text,
  ADD COLUMN IF NOT EXISTS business_hours jsonb;

COMMENT ON COLUMN users.business_hours IS
  'JSON map of weekday keys mon..sun to {open,close,closed?} Europe/Vilnius';
