-- Run this in Supabase SQL Editor to enable username login
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
