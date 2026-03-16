/**
 * usePostReactions.ts
 *
 * Manages reaction state for a single post.
 * Handles optimistic updates, upsert, and notifications.
 * Shared between FeedCard and CardStack.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { sendReactionNotification } from '../services/notifications.service';

export function usePostReactions(
  postId: string,
  postUserId: string,
  currentUserId: string | undefined,
  initialReaction: string | null = null,
  initialReactionCount: number = 0
) {
  const [currentReaction, setCurrentReaction] = useState<string | null>(initialReaction);
  const [reactionCount, setReactionCount] = useState(initialReactionCount);
  const [loadingReaction, setLoadingReaction] = useState(!initialReaction);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch the current user's reaction for this post when not provided
  const fetchMyReaction = useCallback(async () => {
    if (!postId || !currentUserId || currentReaction !== null) return;
    try {
      const { data, error } = await supabase
        .from('reactions')
        .select('emoji')
        .eq('post_id', postId)
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (error) throw error;

      if (mountedRef.current) {
        setCurrentReaction((prev) => prev ?? (data?.emoji ?? null));
        setLoadingReaction(false);
      }
    } catch {
      if (mountedRef.current) setLoadingReaction(false);
    }
  }, [postId, currentUserId, currentReaction]);

  useEffect(() => {
    if (!initialReaction) {
      fetchMyReaction();
    }
  }, [fetchMyReaction, initialReaction]);

  // Toggle a reaction — handles add, change, and remove
  const toggleReaction = useCallback(
    async (emoji: string) => {
      if (!postId || !currentUserId) return;

      const previousReaction = currentReaction;
      const previousCount = reactionCount;

      if (emoji === currentReaction) {
        // Un-react: tapped the same emoji
        setCurrentReaction(null);
        setReactionCount((prev) => Math.max(0, prev - 1));

        try {
          const { error } = await supabase
            .from('reactions')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', currentUserId);

          if (error) throw error;
          // Best-effort: delete any existing reaction notification
          await supabase
            .from('notifications')
            .delete()
            .eq('from_user_id', currentUserId)
            .eq('post_id', postId)
            .eq('type', 'reaction');
        } catch {
          if (mountedRef.current) {
            setCurrentReaction(previousReaction);
            setReactionCount(previousCount);
          }
        }
      } else {
        // New reaction or changed reaction
        const wasNull = currentReaction === null;
        setCurrentReaction(emoji);
        if (wasNull) {
          setReactionCount((prev) => prev + 1);
        }

        try {
          // Remove previous reaction notification if changing emoji
          if (previousReaction) {
            await supabase
              .from('notifications')
              .delete()
              .eq('from_user_id', currentUserId)
              .eq('post_id', postId)
              .eq('type', 'reaction');
          }

          const { error } = await supabase
            .from('reactions')
            .upsert(
              { post_id: postId, user_id: currentUserId, emoji },
              { onConflict: 'post_id,user_id' }
            );

          if (error) throw error;

          if (postUserId && postUserId !== currentUserId) {
            await sendReactionNotification({
              toUserId: postUserId,
              fromUserId: currentUserId,
              postId,
              emoji,
            });
          }
        } catch {
          if (mountedRef.current) {
            setCurrentReaction(previousReaction);
            setReactionCount(previousCount);
          }
        }
      }
    },
    [postId, postUserId, currentUserId, currentReaction, reactionCount]
  );

  // Double-tap heart shortcut
  const doubleTapHeart = useCallback(async () => {
    if (!postId || !currentUserId) return;
    if (currentReaction === '❤️') return; // Already hearted

    const previousReaction = currentReaction;
    const previousCount = reactionCount;
    const wasNull = currentReaction === null;

    setCurrentReaction('❤️');
    if (wasNull) setReactionCount((prev) => prev + 1);

    try {
      if (previousReaction) {
        await supabase
          .from('notifications')
          .delete()
          .eq('from_user_id', currentUserId)
          .eq('post_id', postId)
          .eq('type', 'reaction');
      }

      const { error } = await supabase
        .from('reactions')
        .upsert(
          { post_id: postId, user_id: currentUserId, emoji: '❤️' },
          { onConflict: 'post_id,user_id' }
        );

      if (error) throw error;

      if (postUserId && postUserId !== currentUserId) {
        await sendReactionNotification({
          toUserId: postUserId,
          fromUserId: currentUserId,
          postId,
          emoji: '❤️',
        });
      }
    } catch {
      if (mountedRef.current) {
        setCurrentReaction(previousReaction);
        setReactionCount(previousCount);
      }
    }
  }, [postId, postUserId, currentUserId, currentReaction, reactionCount]);

  return {
    currentReaction,
    reactionCount,
    loadingReaction,
    toggleReaction,
    doubleTapHeart,
  };
}

