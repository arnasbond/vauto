-- Expand docs/legacy enum to match shared/category-registry.ts
-- Live Render / 001_initial_schema uses listings.category TEXT — no enum.
-- This file is a no-op unless type listing_category exists (legacy schema.sql).
-- Stage 14: previously this file aborted the entire migrate chain on a fresh TEXT
-- schema (058–061 never applied). Fail-closed skip when the enum is absent.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_category') THEN
    EXECUTE 'ALTER TYPE listing_category ADD VALUE IF NOT EXISTS ''jobs''';
    EXECUTE 'ALTER TYPE listing_category ADD VALUE IF NOT EXISTS ''clothing''';
    EXECUTE 'ALTER TYPE listing_category ADD VALUE IF NOT EXISTS ''real_estate''';
    EXECUTE 'ALTER TYPE listing_category ADD VALUE IF NOT EXISTS ''transport''';
    EXECUTE 'ALTER TYPE listing_category ADD VALUE IF NOT EXISTS ''tools''';
    EXECUTE 'ALTER TYPE listing_category ADD VALUE IF NOT EXISTS ''rental''';
  END IF;
END $$;
