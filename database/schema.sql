-- Vauto PostgreSQL schema
-- Matches app domain: users, listings, AI seller flow, chats, escrow, favorites
-- Requires: PostgreSQL 15+, optional: pgvector for semantic search embeddings

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE listing_category AS ENUM (
  'electronics',
  'vehicles',
  'services',
  'home',
  'other'
);

CREATE TYPE listing_status AS ENUM (
  'draft',       -- AI extracted, not yet published
  'active',
  'sold',
  'archived'
);

CREATE TYPE seller_input_mode AS ENUM ('upload', 'voice');

CREATE TYPE seller_flow_step AS ENUM (
  'idle',
  'recording',
  'processing',
  'confirmation',
  'published'
);

CREATE TYPE escrow_status AS ENUM (
  'offered',
  'accepted',
  'paid',
  'released',
  'cancelled',
  'disputed'
);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  city          TEXT NOT NULL,
  avatar_url    TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_city ON users (city);

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------

CREATE TABLE listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
  price_label     TEXT,                    -- e.g. "30€/val"
  currency        CHAR(3) NOT NULL DEFAULT 'EUR',
  location        TEXT NOT NULL,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  category        listing_category NOT NULL DEFAULT 'other',
  contact         TEXT,
  has_video       BOOLEAN NOT NULL DEFAULT false,
  status          listing_status NOT NULL DEFAULT 'active',
  -- Denormalized for feed performance; refresh via trigger or cron
  distance_km     DOUBLE PRECISION,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ
);

CREATE INDEX idx_listings_seller ON listings (seller_id);
CREATE INDEX idx_listings_status_created ON listings (status, created_at DESC);
CREATE INDEX idx_listings_category ON listings (category);
CREATE INDEX idx_listings_location ON listings (location);
CREATE INDEX idx_listings_price ON listings (price_cents);

-- ---------------------------------------------------------------------------
-- Listing media (photos, video URLs, AI source captures)
-- ---------------------------------------------------------------------------

CREATE TABLE listing_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  media_type    TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_listing_media_listing ON listing_media (listing_id, sort_order);

-- ---------------------------------------------------------------------------
-- Tags (semantic search / filter bubbles)
-- ---------------------------------------------------------------------------

CREATE TABLE tags (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug  CITEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);

CREATE TABLE listing_tags (
  listing_id UUID NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, tag_id)
);

CREATE INDEX idx_listing_tags_tag ON listing_tags (tag_id);

-- ---------------------------------------------------------------------------
-- Saved listings (favorites / heart)
-- ---------------------------------------------------------------------------

CREATE TABLE saved_listings (
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  listing_id  UUID NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE INDEX idx_saved_listings_user ON saved_listings (user_id, saved_at DESC);

-- ---------------------------------------------------------------------------
-- AI seller flow — drafts & extraction audit
-- ---------------------------------------------------------------------------

CREATE TABLE ai_listing_drafts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  input_mode        seller_input_mode NOT NULL,
  flow_step         seller_flow_step NOT NULL DEFAULT 'processing',
  title             TEXT,
  price_cents       INTEGER,
  location          TEXT,
  contact           TEXT,
  category          listing_category,
  confidence        REAL CHECK (confidence >= 0 AND confidence <= 1),
  transcript        TEXT,                 -- voice input
  source_image_url  TEXT,                 -- photo capture
  listing_id        UUID REFERENCES listings (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_drafts_user ON ai_listing_drafts (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Chat threads & messages
-- ---------------------------------------------------------------------------

CREATE TABLE chat_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  buyer_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seller_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  listing_title   TEXT NOT NULL,          -- snapshot at thread creation
  escrow_offered  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id)
);

CREATE INDEX idx_chat_threads_buyer ON chat_threads (buyer_id, updated_at DESC);
CREATE INDEX idx_chat_threads_seller ON chat_threads (seller_id, updated_at DESC);

CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_thread ON chat_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Escrow (triggered by purchase intent in chat)
-- ---------------------------------------------------------------------------

CREATE TABLE escrow_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       UUID NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
  listing_id      UUID NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  buyer_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seller_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
  currency        CHAR(3) NOT NULL DEFAULT 'EUR',
  status          escrow_status NOT NULL DEFAULT 'offered',
  offered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at     TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  released_at     TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ
);

CREATE INDEX idx_escrow_buyer ON escrow_transactions (buyer_id, status);
CREATE INDEX idx_escrow_seller ON escrow_transactions (seller_id, status);

-- ---------------------------------------------------------------------------
-- Search history (optional — semantic queries for analytics / personalization)
-- ---------------------------------------------------------------------------

CREATE TABLE search_queries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users (id) ON DELETE SET NULL,
  query_text    TEXT NOT NULL,
  input_mode    TEXT NOT NULL DEFAULT 'text' CHECK (input_mode IN ('text', 'voice')),
  results_count INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_search_queries_user ON search_queries (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_listings_updated_at
  BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ai_drafts_updated_at
  BEFORE UPDATE ON ai_listing_drafts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_chat_threads_updated_at
  BEFORE UPDATE ON chat_threads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Optional: pgvector column for semantic search (uncomment when extension enabled)
-- ---------------------------------------------------------------------------
-- CREATE EXTENSION IF NOT EXISTS vector;
-- ALTER TABLE listings ADD COLUMN embedding vector(1536);
-- CREATE INDEX idx_listings_embedding ON listings USING ivfflat (embedding vector_cosine_ops);
