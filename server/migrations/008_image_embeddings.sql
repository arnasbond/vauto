ALTER TABLE listings ADD COLUMN IF NOT EXISTS image_embedding JSONB;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS image_embedding_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_listings_has_image_embedding
  ON listings ((image_embedding IS NOT NULL))
  WHERE NOT banned AND status = 'active';
