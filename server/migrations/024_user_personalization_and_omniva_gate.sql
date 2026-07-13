-- Personalization survey fields (optional) + Omniva locker gatekeeper flag
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS age_group TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS hobbies TEXT[];

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS allow_pastomatas BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_listings_allow_pastomatas
  ON listings (allow_pastomatas);
