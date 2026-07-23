-- Expand docs/legacy enum to match shared/category-registry.ts
-- Live Render DB uses category TEXT (001_initial_schema) — this is for
-- database/schema.sql alignment and any enum-based environments.

ALTER TYPE listing_category ADD VALUE IF NOT EXISTS 'jobs';
ALTER TYPE listing_category ADD VALUE IF NOT EXISTS 'clothing';
ALTER TYPE listing_category ADD VALUE IF NOT EXISTS 'real_estate';
ALTER TYPE listing_category ADD VALUE IF NOT EXISTS 'transport';
ALTER TYPE listing_category ADD VALUE IF NOT EXISTS 'tools';
ALTER TYPE listing_category ADD VALUE IF NOT EXISTS 'rental';
