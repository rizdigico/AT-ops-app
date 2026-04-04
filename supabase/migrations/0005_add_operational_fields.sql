-- Add operational fields for richer flight card display
ALTER TABLE flights ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS from_location TEXT;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS to_location TEXT;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS services TEXT;
