-- Run this SQL in Supabase SQL Editor to enforce ONE reaction per user per post.
-- Each user can only have a single emoji reaction per post at any time.

-- Step 1: Deduplicate — keep only one reaction per (post_id, user_id), preferring the most recent
-- (If your reactions table has created_at, we keep the latest. Otherwise we keep one arbitrarily.)
DELETE FROM public.reactions r1
WHERE EXISTS (
  SELECT 1 FROM public.reactions r2
  WHERE r1.post_id = r2.post_id AND r1.user_id = r2.user_id
    AND r1.ctid < r2.ctid
);

-- Step 2: Drop the old unique constraint (post_id, user_id, emoji)
-- If this fails, run: SELECT conname FROM pg_constraint WHERE conrelid = 'public.reactions'::regclass;
-- and replace the constraint name below.
ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_post_id_user_id_emoji_key;

-- Step 3: Add new unique constraint — one reaction per user per post
ALTER TABLE public.reactions ADD CONSTRAINT reactions_post_id_user_id_key UNIQUE (post_id, user_id);
