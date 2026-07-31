-- AI Preference Center / AI Twin profile fields on user_preferences.
-- Shoe/clothing sizes, body measurements, purchase prefs — Magic Mirror reads these.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS shoe_size_eu TEXT,
  ADD COLUMN IF NOT EXISTS clothing_size TEXT,
  ADD COLUMN IF NOT EXISTS body_measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS purchase_prefs JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN user_preferences.shoe_size_eu IS 'EU shoe size for AI Twin / Magic Mirror';
COMMENT ON COLUMN user_preferences.clothing_size IS 'Clothing size S/M/L/XL or free text';
COMMENT ON COLUMN user_preferences.body_measurements IS 'Optional cm measurements {heightCm,bustCm,waistCm,hipsCm}';
COMMENT ON COLUMN user_preferences.purchase_prefs IS 'Purchase preferences / interests array';
