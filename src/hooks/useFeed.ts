/**
 * useFeed.ts
 *
 * Manages feed data: fetching, pagination, debounced sorting.
 * FeedScreen becomes a thin UI layer that calls this hook.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { PostWithProfile } from '../types';
import { fetchPostsByUsers } from '../services/posts.service';
import { CONFIG } from '../lib/config';

function scoreFeedPost(post: PostWithProfile): number {
  const ageMs = Date.now() - new Date(post.created_at).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 1 - ageHours / CONFIG.FEED_SCORE_RECENCY_HOURS);
  const reactionCount = post.reaction_count ?? 0;
  const commentCount = post.comment_count ?? 0;
  const engagementBonus = Math.min(
    CONFIG.FEED_SCORE_ENGAGEMENT_CAP,
    (reactionCount + commentCount) * CONFIG.FEED_SCORE_ENGAGEMENT_FACTOR
  );
  return recencyScore + engagementBonus;
}

export function useFeed(userId: string | undefined, friendIds: string[]) {
  const [feedPosts, setFeedPosts] = useState<PostWithProfile[]>([]);
  const [displayPosts, setDisplayPosts] = useState<PostWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastSortRef = useRef(0);
  const sortTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);

  const sortPosts = useCallback((posts: PostWithProfile[]) => {
    const sorted = [...posts].sort((a, b) => scoreFeedPost(b) - scoreFeedPost(a));
    setDisplayPosts(sorted);
    lastSortRef.current = Date.now();
  }, []);

  const fetchFeed = useCallback(
    async (isLoadMore = false) => {
      if (!userId || friendIds.length === 0) {
        setLoading(false);
        return;
      }
      if (isLoadMore && (loadingMore || !hasMore)) return;

      const fetchId = ++fetchIdRef.current;
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      try {
        const cursor =
          isLoadMore && feedPosts.length > 0
            ? feedPosts[feedPosts.length - 1].created_at
            : undefined;

        const { data, error } = await fetchPostsByUsers(
          friendIds,
          cursor,
          CONFIG.FEED_PAGE_SIZE
        );

        if (error || fetchId !== fetchIdRef.current) return;

        const newPosts = (data ?? []) as unknown as PostWithProfile[];

        if (isLoadMore) {
          setFeedPosts((prev) => [...prev, ...newPosts]);
        } else {
          setFeedPosts(newPosts);
        }
        setHasMore(newPosts.length === CONFIG.FEED_PAGE_SIZE);
      } catch (err) {
        if (__DEV__) console.error('Feed fetch failed:', err);
      } finally {
        if (fetchId === fetchIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [userId, friendIds, feedPosts, loadingMore, hasMore]
  );

  // Debounced sorting — re-sort at most every 30 seconds
  useEffect(() => {
    if (feedPosts.length === 0) {
      setDisplayPosts([]);
      return;
    }

    const timeSinceLastSort = Date.now() - lastSortRef.current;

    if (timeSinceLastSort >= 30000 || displayPosts.length === 0) {
      sortPosts(feedPosts);
    } else {
      // Update data without re-sorting — keep current order
      setDisplayPosts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newOnes = feedPosts.filter((p) => !existingIds.has(p.id));
        const updatedExisting = prev
          .map((p) => feedPosts.find((fp) => fp.id === p.id))
          .filter(Boolean) as PostWithProfile[];
        return [...newOnes, ...updatedExisting];
      });

      if (sortTimeoutRef.current) clearTimeout(sortTimeoutRef.current);
      const remaining = 30000 - timeSinceLastSort;
      sortTimeoutRef.current = setTimeout(() => {
        sortPosts(feedPosts);
      }, remaining);
    }
  }, [feedPosts, displayPosts.length, sortPosts]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (sortTimeoutRef.current) clearTimeout(sortTimeoutRef.current);
    };
  }, []);

  const forceSort = useCallback(() => {
    if (feedPosts.length > 0) {
      sortPosts(feedPosts);
    }
  }, [feedPosts, sortPosts]);

  const loadMore = useCallback(() => {
    fetchFeed(true);
  }, [fetchFeed]);

  return {
    displayPosts,
    feedPosts,
    loading,
    loadingMore,
    hasMore,
    fetchFeed,
    loadMore,
    forceSort,
  };
}

