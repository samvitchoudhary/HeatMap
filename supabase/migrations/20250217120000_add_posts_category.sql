-- Add category column to posts table
-- Category is optional; users can tag each post with one category during upload
ALTER TABLE posts ADD COLUMN IF NOT EXISTS category text;
