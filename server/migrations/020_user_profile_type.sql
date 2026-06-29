ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_type TEXT
  CHECK (profile_type IS NULL OR profile_type IN ('private', 'business'));

CREATE INDEX IF NOT EXISTS idx_users_profile_type ON users (profile_type);
