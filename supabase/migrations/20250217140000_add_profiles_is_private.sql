-- Add is_private column to profiles for account privacy
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false;
