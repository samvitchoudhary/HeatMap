/**
 * usePosts.tsx
 *
 * Shared hook and context for posts data.
 * Provides a central cache of posts that all screens read from.
 * When a post is created, deleted, or reacted to, all screens see the update.
 */

import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { CONFIG } from '../lib/config';
import type { PostWithProfile } from '../types';
import {
  fetchUserPosts,
  fetchPostsByUsers,
  fetchAllVisiblePosts,
} from '../services/posts.service';

const PAGE_SIZE = CONFIG.POSTS_PAGE_SIZE;

/**
 * Shape returned by Supabase post queries with joins.
 * Must match the posts.service POST_SELECT columns exactly.
 * Supabase types foreign-key joins as arrays; at runtime they're single objects.
 */
type SupabaseProfileJoin = {
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_private?: boolean;
};

type SupabaseTagProfileJoin = {
  display_name: string;
  username: string;
};

export type SupabasePostRow = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  latitude: number;
  longitude: number;
  venue_name: string | null;
  created_at: string;
  category: string | null;
  reaction_count: number | null;
  comment_count: number | null;
  profiles: SupabaseProfileJoin | SupabaseProfileJoin[] | null;
  post_tags: {
    tagged_user_id: string;
    profiles: SupabaseTagProfileJoin | SupabaseTagProfileJoin[] | null;
  }[] | null;
};

function unwrapJoin<T>(val: T | T[] | null): T | null {
  if (val == null) return null;
  return Array.isArray(val) ? val[0] ?? null : val;
}

export function mapSupabasePost(row: SupabasePostRow): PostWithProfile {
  const profile = unwrapJoin(row.profiles);
  return {
    id: row.id,
    user_id: row.user_id,
    image_url: row.image_url,
    caption: row.caption ?? '',
    latitude: row.latitude,
    longitude: row.longitude,
    venue_name: row.venue_name,
    created_at: row.created_at,
    category: row.category,
    reaction_count: row.reaction_count ?? 0,
    comment_count: row.comment_count ?? 0,
    profiles: profile ?? { username: 'deleted', display_name: 'Deleted User', avatar_url: null },
    post_tags: (row.post_tags ?? []).map(tag => ({
      tagged_user_id: tag.tagged_user_id,
      profiles: unwrapJoin(tag.profiles) ?? { display_name: 'Unknown', username: 'unknown' },
    })),
  };
}

type PostsContextType = {
  /** All fetched posts (map + feed) */
  posts: PostWithProfile[];
  /** Whether the initial fetch is in progress */
  loading: boolean;
  /** Whether more pages are available */
  hasMore: boolean;
  /** Whether a loadMore request is in flight */
  loadingMore: boolean;
  /** Fetch user's own posts immediately (no friend dependency) */
  fetchOwnPosts: (userId: string) => Promise<void>;
  /** Fetch all posts (user + friends). Use force=true when friendIds just loaded to bypass throttle. */
  fetchAllPosts: (friendIds: string[], userId: string, force?: boolean) => Promise<void>;
  /** Fetch own + friends + public accounts' posts. Use when "Everyone" filter is active. */
  fetchPublicPosts: (friendIds: string[], userId: string) => Promise<void>;
  /** Load the next page of posts older than the current oldest */
  loadMorePosts: (friendIds: string[], userId: string) => Promise<void>;
  /** Add a newly created post to the cache */
  addPost: (post: PostWithProfile) => void;
  /** Update an existing post in the cache */
  updatePost: (postId: string, updates: Partial<PostWithProfile>) => void;
  /** Remove a post from the cache */
  removePost: (postId: string) => void;
  /** Force refresh (pass includePublic=true for "Everyone" filter) */
  refresh: (friendIds: string[], userId: string, includePublic?: boolean) => Promise<void>;
};

const PostsContext = createContext<PostsContextType>({
  posts: [],
  loading: true,
  hasMore: true,
  loadingMore: false,
  fetchOwnPosts: async () => {},
  fetchAllPosts: async () => {},
  fetchPublicPosts: async () => {},
  loadMorePosts: async () => {},
  addPost: () => {},
  updatePost: () => {},
  removePost: () => {},
  refresh: async () => {},
});

export const PostsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [posts, setPosts] = useState<PostWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastFetchRef = useRef(0);
  const hasFetchedRef = useRef(false);
  const postsFetchIdRef = useRef(0);
  const fetchModeRef = useRef<'own' | 'all' | 'public'>('all');

  const fetchOwnPosts = useCallback(async (userId: string) => {
    const fetchId = ++postsFetchIdRef.current;
    fetchModeRef.current = 'own';
    try {
      const { data, error } = await fetchUserPosts(userId, undefined, PAGE_SIZE);
      if (error) {
        if (__DEV__) console.error('Failed to fetch own posts:', error);
        return;
      }
      if (fetchId !== postsFetchIdRef.current) return;
      hasFetchedRef.current = true;
      setPosts((data ?? []).map(row => mapSupabasePost(row as SupabasePostRow)));
      setHasMore((data ?? []).length === PAGE_SIZE);
    } finally {
      if (fetchId === postsFetchIdRef.current) setLoading(false);
    }
  }, []);

  const fetchAllPosts = useCallback(async (friendIds: string[], userId: string, force?: boolean) => {
    const fetchId = ++postsFetchIdRef.current;
    fetchModeRef.current = 'all';
    const now = Date.now();
    if (!force && now - lastFetchRef.current < CONFIG.POSTS_THROTTLE_MS && hasFetchedRef.current) return;
    lastFetchRef.current = now;

    try {
      const allUserIds = [userId, ...friendIds];
      const { data, error } = await fetchPostsByUsers(allUserIds, undefined, PAGE_SIZE);

      if (error) {
        if (__DEV__) console.error('Failed to fetch posts:', error);
        return;
      }

      if (fetchId !== postsFetchIdRef.current) return;

      hasFetchedRef.current = true;
      setPosts((data ?? []).map(row => mapSupabasePost(row as SupabasePostRow)));
      setHasMore((data ?? []).length === PAGE_SIZE);
    } finally {
      if (fetchId === postsFetchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const fetchPublicPosts = useCallback(async (_friendIds: string[], _userId: string) => {
    const fetchId = ++postsFetchIdRef.current;
    fetchModeRef.current = 'public';

    try {
      const { data, error } = await fetchAllVisiblePosts(undefined, PAGE_SIZE);

      if (error) {
        if (__DEV__) console.error('Failed to fetch public posts:', error);
        return;
      }
      if (fetchId !== postsFetchIdRef.current) return;

      hasFetchedRef.current = true;
      setPosts((data ?? []).map(row => mapSupabasePost(row as SupabasePostRow)));
      setHasMore((data ?? []).length === PAGE_SIZE);
    } catch (err) {
      if (__DEV__) console.error('Failed to fetch public posts:', err);
    } finally {
      if (fetchId === postsFetchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const loadMorePosts = useCallback(async (friendIds: string[], userId: string) => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      const lastPost = posts[posts.length - 1];
      if (!lastPost) return;

      const mode = fetchModeRef.current;

      if (mode === 'public') {
        const { data, error } = await fetchAllVisiblePosts(lastPost.created_at, PAGE_SIZE);

        if (error) {
          if (__DEV__) console.error('Failed to load more public posts:', error);
          return;
        }

        const newPosts = (data ?? []).map(row => mapSupabasePost(row as SupabasePostRow));
        setPosts((prev) => [...prev, ...newPosts]);
        setHasMore(newPosts.length === PAGE_SIZE);
      } else {
        const userIds = mode === 'own' ? [userId] : [userId, ...friendIds];

        const { data, error } = await fetchPostsByUsers(userIds, lastPost.created_at, PAGE_SIZE);

        if (error) {
          if (__DEV__) console.error('Failed to load more posts:', error);
          return;
        }

        const newPosts = (data ?? []).map(row => mapSupabasePost(row as SupabasePostRow));
        setPosts((prev) => [...prev, ...newPosts]);
        setHasMore(newPosts.length === PAGE_SIZE);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [posts, loadingMore, hasMore]);

  const addPost = useCallback((post: PostWithProfile) => {
    setPosts((prev) => [post, ...prev]);
  }, []);

  const updatePost = useCallback((postId: string, updates: Partial<PostWithProfile>) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, ...updates } : p))
    );
  }, []);

  const removePost = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const refresh = useCallback(
    async (friendIds: string[], userId: string, includePublic = false) => {
      lastFetchRef.current = 0;
      hasFetchedRef.current = false;
      if (includePublic) {
        await fetchPublicPosts(friendIds, userId);
      } else {
        await fetchAllPosts(friendIds, userId);
      }
    },
    [fetchAllPosts, fetchPublicPosts]
  );

  const value = useMemo(() => ({
    posts,
    loading,
    hasMore,
    loadingMore,
    fetchOwnPosts,
    fetchAllPosts,
    fetchPublicPosts,
    loadMorePosts,
    addPost,
    updatePost,
    removePost,
    refresh,
  }), [posts, loading, hasMore, loadingMore, fetchOwnPosts, fetchAllPosts, fetchPublicPosts, loadMorePosts, addPost, updatePost, removePost, refresh]);

  return (
    <PostsContext.Provider value={value}>
      {children}
    </PostsContext.Provider>
  );
};

export const usePosts = () => useContext(PostsContext);
