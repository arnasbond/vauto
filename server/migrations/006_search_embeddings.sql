ALTER TABLE listings ADD COLUMN IF NOT EXISTS search_embedding JSONB;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_listings_has_embedding
  ON listings ((search_embedding IS NOT NULL))
  WHERE NOT banned AND status = 'active';
