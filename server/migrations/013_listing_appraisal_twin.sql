-- VI etapas: kainų vertinimas + derybų dvynio laukai
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS min_negotiation_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS appraisal_score DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS market_price_history (
  id                TEXT PRIMARY KEY,
  category          TEXT NOT NULL,
  subcategory       TEXT,
  city              TEXT,
  condition_grade   TEXT,
  attributes_hash   TEXT,
  min_price         NUMERIC(12, 2) NOT NULL,
  max_price         NUMERIC(12, 2) NOT NULL,
  median_price      NUMERIC(12, 2) NOT NULL,
  optimal_price     NUMERIC(12, 2) NOT NULL,
  sample_size       INTEGER NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_price_history_lookup
  ON market_price_history (category, city, condition_grade);
