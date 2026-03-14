-- Add notification_prefs jsonb column to profiles for user notification preferences
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT NULL;
