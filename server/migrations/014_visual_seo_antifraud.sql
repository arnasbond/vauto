-- VII etapas: Visual SEO, anti-fraud, nuotraukų metaduomenys
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_alt TEXT,
  ADD COLUMN IF NOT EXISTS image_title TEXT;
