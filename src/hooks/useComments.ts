/**
 * useComments.ts
 *
 * Manages comments for a post: fetching, pagination, threading, posting, replies.
 * Shared between CommentSheet and FeedCommentModal.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { sendCommentNotification } from '../services/notifications.service';
import { buildThreadedComments } from '../lib/commentUtils';
import { CONFIG } from '../lib/config';

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
};

const COMMENT_SELECT = `
  id, post_id, user_id, content, parent_id, created_at,
  profiles:user_id(username, display_name, avatar_url)
`;

export function useComments(
  postId: string,
  postUserId: string | undefined,
  currentUserId: string | undefined,
  /** Optional: e.g. decrement local comment count in parent UI */
  onCommentDeleted?: () => void
) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [replyTarget, setReplyTarget] = useState<{ id: string; username: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fetchIdRef = useRef(0);

  const threadedComments = useMemo(() => buildThreadedComments(comments), [comments]);

  const fetchComments = useCallback(
    async (isLoadMore = false) => {
      if (!postId) return;
      if (isLoadMore && (loadingMore || !hasMore)) return;

      const fetchId = ++fetchIdRef.current;
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      try {
        const from = isLoadMore ? comments.length : 0;
        const to = from + CONFIG.COMMENTS_PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from('comments')
          .select(COMMENT_SELECT)
          .eq('post_id', postId)
          .order('created_at', { ascending: true })
          .range(from, to);

        if (error || fetchId !== fetchIdRef.current) return;

        const newComments = (data ?? []) as Comment[];

        if (isLoadMore) {
          setComments((prev) => [...prev, ...newComments]);
        } else {
          setComments(newComments);
        }
        setHasMore(newComments.length === CONFIG.COMMENTS_PAGE_SIZE);
      } catch (err) {
        if (__DEV__) console.error('Failed to fetch comments:', err);
      } finally {
        if (fetchId === fetchIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [postId, comments.length, loadingMore, hasMore]
  );

  const postComment = useCallback(
    async (content: string) => {
      if (!content.trim() || !postId || !currentUserId || submitting) return false;

      setSubmitting(true);
      try {
        const { data, error } = await supabase
          .from('comments')
          .insert({
            post_id: postId,
            user_id: currentUserId,
            content: content.trim(),
            parent_id: replyTarget?.id ?? null,
          })
          .select(COMMENT_SELECT)
          .single();

        if (error) throw error;

        if (data) {
          setComments((prev) => [...prev, data as Comment]);
        }

        if (postUserId && postUserId !== currentUserId) {
          await sendCommentNotification({
            toUserId: postUserId,
            fromUserId: currentUserId,
            postId,
            commentId: (data as Comment).id,
          });
        }

        setReplyTarget(null);

        return true;
      } catch (err) {
        if (__DEV__) console.error('Failed to post comment:', err);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [postId, currentUserId, postUserId, replyTarget, submitting]
  );

  const startReply = useCallback((commentId: string, username: string) => {
    setReplyTarget({ id: commentId, username });
  }, []);

  const cancelReply = useCallback(() => {
    setReplyTarget(null);
  }, []);

  const deleteComment = useCallback(
    async (commentId: string): Promise<boolean> => {
      try {
        const { error } = await supabase.from('comments').delete().eq('id', commentId);

        if (error) throw error;

        setComments((prev) => prev.filter((c) => c.id !== commentId));
        onCommentDeleted?.();

        return true;
      } catch (err) {
        if (__DEV__) console.error('Failed to delete comment:', err);
        Alert.alert('Error', 'Failed to delete comment. Please try again.');
        return false;
      }
    },
    [onCommentDeleted]
  );

  return {
    comments,
    threadedComments,
    loading,
    loadingMore,
    hasMore,
    replyTarget,
    submitting,
    fetchComments,
    loadMore: () => fetchComments(true),
    postComment,
    startReply,
    cancelReply,
    deleteComment,
  };
}

