-- Išorinių pardavimo portalų profilio nuorodos (Vinted, Marktplaats ir kt.)
CREATE TABLE IF NOT EXISTS user_portal_links (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  portal_key      TEXT NOT NULL,
  portal_label    TEXT NOT NULL,
  profile_url     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'synced',
  item_count      INTEGER NOT NULL DEFAULT 0,
  last_item_hash  TEXT,
  last_synced_at  TIMESTAMPTZ,
  next_sync_at    TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, portal_key)
);

CREATE INDEX IF NOT EXISTS idx_user_portal_links_next_sync
  ON user_portal_links (next_sync_at)
  WHERE status <> 'error';

CREATE INDEX IF NOT EXISTS idx_user_portal_links_user
  ON user_portal_links (user_id);
