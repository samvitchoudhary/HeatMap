-- Allow users who sent a reaction notification to delete it when they change or remove their reaction.
-- Without this, DELETE filtered by from_user_id alone fails if RLS only allows user_id = auth.uid().
-- notifyReaction / removeReactionNotification delete with user_id + from_user_id + post_id + type = 'reaction'.
-- If RLS is not enabled on notifications, enable it and add matching SELECT/INSERT policies in the Supabase dashboard.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'notifications_delete_reaction_as_sender'
  ) THEN
    CREATE POLICY notifications_delete_reaction_as_sender
    ON public.notifications
    FOR DELETE
    TO authenticated
    USING (from_user_id = auth.uid() AND type = 'reaction');
  END IF;
END $$;
