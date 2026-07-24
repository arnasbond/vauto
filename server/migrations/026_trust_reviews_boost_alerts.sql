-- Trust reviews: tags + free TOP boost credits for review gamification.
ALTER TABLE seller_reviews
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS free_top_boost_credits INTEGER NOT NULL DEFAULT 0;

-- Allow review-reward ledger rows (free TOP boost grant).
ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;

ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_kind_check
  CHECK (kind IN ('top_up', 'promote', 'refund', 'review_reward', 'free_boost'));

CREATE INDEX IF NOT EXISTS idx_reviews_seller_rating
  ON seller_reviews (seller_id, rating DESC, created_at DESC);
