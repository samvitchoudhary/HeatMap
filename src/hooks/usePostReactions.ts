/**
 * usePostReactions.ts
 *
 * Manages reaction state for a single post.
 * Fetches all reactions for the post (per-emoji counts + current user's emoji),
 * optimistic updates, upsert/delete, and notifications.
 * Shared between FeedCard and CardStack.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { notifyReaction, removeReactionNotification } from '../services/notifications.service';

function removeEmojiCount(prev: Record<string, number>, emoji: string | null): Record<string, number> {
  if (!emoji) return prev;
  const next = { ...prev };
  const v = (next[emoji] ?? 0) - 1;
  if (v <= 0) delete next[emoji];
  else next[emoji] = v;
  return next;
}

function addEmojiCount(prev: Record<string, number>, emoji: string): Record<string, number> {
  return { ...prev, [emoji]: (prev[emoji] ?? 0) + 1 };
}

export function usePostReactions(
  postId: string,
  postUserId: string,
  currentUserId: string | undefined,
  initialUserReaction: string | null = null,
  /** Denormalized total from `posts.reaction_count` (all users). */
  initialReactionCount: number = 0,
  /** Optional per-emoji counts from feed/API before fetch completes. */
  initialPerEmojiCounts: Record<string, number> = {}
) {
  const [currentReaction, setCurrentReaction] = useState<string | null>(initialUserReaction);
  const [reactionCount, setReactionCount] = useState(initialReactionCount);
  const [allReactionCounts, setAllReactionCounts] = useState<Record<string, number>>(() => ({
    ...initialPerEmojiCounts,
  }));
  const [loadingReaction, setLoadingReaction] = useState(true);
  const mountedRef = useRef(true);
  /** Bumped on user mutation so late fetch responses don't clobber optimistic UI. */
  const reactionDataTokenRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset from props, then load all reactions from DB (cancel stale requests on post/user change).
  useEffect(() => {
    const fetchToken = ++reactionDataTokenRef.current;
    setCurrentReaction(initialUserReaction);
    setReactionCount(initialReactionCount);
    setAllReactionCounts({ ...initialPerEmojiCounts });
    setLoadingReaction(true);

    let cancelled = false;

    (async () => {
      if (!postId) {
        if (!cancelled && mountedRef.current && fetchToken === reactionDataTokenRef.current) {
          setLoadingReaction(false);
        }
        return;
      }
      try {
        const { data, error } = await supabase
          .from('reactions')
          .select('emoji, user_id')
          .eq('post_id', postId);

        if (error) throw error;
        if (cancelled || !mountedRef.current) return;
        if (fetchToken !== reactionDataTokenRef.current) return;

        const counts: Record<string, number> = {};
        let myReaction: string | null = null;
        for (const r of data ?? []) {
          const em = r.emoji as string;
          counts[em] = (counts[em] ?? 0) + 1;
          if (currentUserId && r.user_id === currentUserId) {
            myReaction = em;
          }
        }

        setAllReactionCounts(counts);
        setReactionCount((data ?? []).length);
        setCurrentReaction(myReaction);
        setLoadingReaction(false);
      } catch {
        if (!cancelled && mountedRef.current && fetchToken === reactionDataTokenRef.current) {
          setLoadingReaction(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [postId, currentUserId, initialUserReaction, initialReactionCount]);

  const toggleReaction = useCallback(
    async (emoji: string) => {
      if (!postId || !currentUserId) return;

      reactionDataTokenRef.current += 1;

      const previousReaction = currentReaction;
      const previousCount = reactionCount;
      const previousAllCounts = { ...allReactionCounts };

      if (emoji === currentReaction) {
        setCurrentReaction(null);
        setReactionCount((prev) => Math.max(0, prev - 1));
        setAllReactionCounts((c) => removeEmojiCount(c, currentReaction));

        try {
          const { error } = await supabase
            .from('reactions')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', currentUserId);

          if (error) throw error;
          if (postUserId) {
            await removeReactionNotification({
              recipientUserId: postUserId,
              fromUserId: currentUserId,
              postId,
            });
          }
        } catch {
          if (mountedRef.current) {
            setCurrentReaction(previousReaction);
            setReactionCount(previousCount);
            setAllReactionCounts(previousAllCounts);
          }
        }
      } else {
        const wasNull = currentReaction === null;
        setCurrentReaction(emoji);
        if (wasNull) {
          setReactionCount((prev) => prev + 1);
          setAllReactionCounts((c) => addEmojiCount(c, emoji));
        } else {
          setAllReactionCounts((c) => addEmojiCount(removeEmojiCount(c, previousReaction), emoji));
        }

        try {
          const { error } = await supabase
            .from('reactions')
            .upsert({ post_id: postId, user_id: currentUserId, emoji }, { onConflict: 'post_id,user_id' });

          if (error) throw error;

          if (postUserId) {
            await notifyReaction({
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
            setAllReactionCounts(previousAllCounts);
          }
        }
      }
    },
    [postId, postUserId, currentUserId, currentReaction, reactionCount, allReactionCounts]
  );

  const doubleTapHeart = useCallback(async () => {
    if (!postId || !currentUserId) return;
    if (currentReaction === '❤️') return;

    reactionDataTokenRef.current += 1;

    const previousReaction = currentReaction;
    const previousCount = reactionCount;
    const previousAllCounts = { ...allReactionCounts };

    if (previousReaction === null) {
      setReactionCount((prev) => prev + 1);
      setAllReactionCounts((c) => addEmojiCount(c, '❤️'));
    } else if (previousReaction !== '❤️') {
      setAllReactionCounts((c) => addEmojiCount(removeEmojiCount(c, previousReaction), '❤️'));
    }
    setCurrentReaction('❤️');

    try {
      const { error } = await supabase
        .from('reactions')
        .upsert({ post_id: postId, user_id: currentUserId, emoji: '❤️' }, { onConflict: 'post_id,user_id' });

      if (error) throw error;

      if (postUserId) {
        await notifyReaction({
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
        setAllReactionCounts(previousAllCounts);
      }
    }
  }, [postId, postUserId, currentUserId, currentReaction, reactionCount, allReactionCounts]);

  return {
    currentReaction,
    reactionCount,
    allReactionCounts,
    loadingReaction,
    toggleReaction,
    doubleTapHeart,
  };
}
