-- Atomic delete + optional insert for reaction notifications (SECURITY DEFINER bypasses RLS).
-- Ensures delete completes in the same transaction as insert; fixes duplicate rows when client DELETE was blocked by RLS.

CREATE OR REPLACE FUNCTION public.replace_reaction_notification(
  p_user_id uuid,
  p_from_user_id uuid,
  p_post_id uuid,
  p_emoji text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND from_user_id = p_from_user_id
    AND post_id = p_post_id
    AND type = 'reaction';

  IF p_emoji IS NOT NULL AND length(trim(p_emoji)) > 0 THEN
    INSERT INTO public.notifications (user_id, from_user_id, post_id, type, emoji, read)
    VALUES (p_user_id, p_from_user_id, p_post_id, 'reaction', trim(p_emoji), false);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_reaction_notification(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_reaction_notification(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_reaction_notification(uuid, uuid, uuid, text) TO service_role;
