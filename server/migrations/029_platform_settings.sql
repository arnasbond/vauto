-- Lightweight platform kill switches / ops flags for Control Center.
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

INSERT INTO platform_settings (key, value)
VALUES
  ('maintenanceMode', 'false'),
  ('disableNewListings', 'false'),
  ('disableCheckout', 'false')
ON CONFLICT (key) DO NOTHING;
