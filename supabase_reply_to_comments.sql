-- Run this SQL in Supabase SQL Editor to add threaded replies support.
-- A comment with parent_id = NULL is a top-level comment.
-- A comment with parent_id is a reply to that comment.

ALTER TABLE public.comments ADD COLUMN parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE DEFAULT NULL;
