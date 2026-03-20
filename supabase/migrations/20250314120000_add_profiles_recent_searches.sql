-- Recent user searches for the Search tab (array of profile snapshots as JSON)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS recent_searches jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profiles.recent_searches IS 'Last searched users (max 15), stored as JSON array of {id, username, display_name, avatar_url}';
