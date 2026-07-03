-- Persistent AI preferences, behavior events, nudge dedupe, onboarding state
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id              TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  default_region       TEXT,
  preferred_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_sizes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  primary_vehicle      JSONB,
  wardrobe_mode        BOOLEAN NOT NULL DEFAULT false,
  notification_prefs   JSONB NOT NULL DEFAULT '{}'::jsonb,
  usage_intent         TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_behavior_events (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_behavior_events_user
  ON user_behavior_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_nudges (
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  nudge_key     TEXT NOT NULL,
  last_fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload       JSONB,
  PRIMARY KEY (user_id, nudge_key)
);

CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id      TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  step         INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  answers      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
