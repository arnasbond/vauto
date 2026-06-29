-- Profile name parts + nickname for editable user header
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(80);
