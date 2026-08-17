-- Defensive: listings.tags is defined in 001_initial_schema.sql.
-- CREATE TABLE IF NOT EXISTS does not add missing columns if a narrower stub
-- created `listings` first (test harness / older bootstrap). Production SELECT
-- LISTING_SELECT / LISTING_SEARCH_SELECT in server/src/repository.ts reads tags.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
