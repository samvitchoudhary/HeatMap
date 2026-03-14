/**
 * usePosts.tsx
 *
 * Shared hook and context for posts data.
 * Provides a central cache of posts that all screens read from.
 * When a post is created, deleted, or reacted to, all screens see the update.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { PostWithProfile } from '../types';

const POST_SELECT =
  'id, user_id, image_url, caption, latitude, longitude, venue_name, created_at, category, profiles:user_id(username, display_name, avatar_url, is_private), post_tags(tagged_user_id, profiles:tagged_user_id(display_name, username))';

const PAGE_SIZE = 50;

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
  /** Force refresh */
  refresh: (friendIds: string[], userId: string) => Promise<void>;
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
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (error) {
        if (__DEV__) console.error('Failed to fetch own posts:', error);
        return;
      }
      if (fetchId !== postsFetchIdRef.current) return;
      hasFetchedRef.current = true;
      setPosts((data ?? []) as unknown as PostWithProfile[]);
      setHasMore((data ?? []).length === PAGE_SIZE);
    } finally {
      if (fetchId === postsFetchIdRef.current) setLoading(false);
    }
  }, []);

  const fetchAllPosts = useCallback(async (friendIds: string[], userId: string, force?: boolean) => {
    const fetchId = ++postsFetchIdRef.current;
    fetchModeRef.current = 'all';
    const now = Date.now();
    if (!force && now - lastFetchRef.current < 15000 && hasFetchedRef.current) return;
    lastFetchRef.current = now;

    try {
      const allUserIds = [userId, ...friendIds];
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .in('user_id', allUserIds)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) {
        if (__DEV__) console.error('Failed to fetch posts:', error);
        return;
      }

      if (fetchId !== postsFetchIdRef.current) return;

      hasFetchedRef.current = true;
      setPosts((data ?? []) as unknown as PostWithProfile[]);
      setHasMore((data ?? []).length === PAGE_SIZE);
    } finally {
      if (fetchId === postsFetchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const fetchPublicPosts = useCallback(async (friendIds: string[], userId: string) => {
    const fetchId = ++postsFetchIdRef.current;
    fetchModeRef.current = 'public';
    const excludeIds = [userId, ...friendIds];

    try {
      const friendQuery = supabase
        .from('posts')
        .select(POST_SELECT)
        .in('user_id', [userId, ...friendIds])
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      const excludeStr = `("${excludeIds.join('","')}")`;
      const publicQuery = supabase
        .from('posts')
        .select(POST_SELECT)
        .not('user_id', 'in', excludeStr)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      const [friendResult, publicResult] = await Promise.allSettled([
        friendQuery,
        publicQuery,
      ]);

      if (fetchId !== postsFetchIdRef.current) return;

      const friendPosts =
        friendResult.status === 'fulfilled' ? (friendResult.value.data ?? []) : [];
      const publicRaw =
        publicResult.status === 'fulfilled' ? (publicResult.value.data ?? []) : [];
      const publicPosts = publicRaw.filter(
        (p: { profiles?: { is_private?: boolean } }) => p.profiles?.is_private !== true
      );

      const allPosts: typeof friendPosts = [...friendPosts];
      const existingIds = new Set(friendPosts.map((p: { id: string }) => p.id));
      for (const post of publicPosts) {
        if (!existingIds.has(post.id)) {
          allPosts.push(post);
          existingIds.add(post.id);
        }
      }

      allPosts.sort(
        (a: { created_at: string }, b: { created_at: string }) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      hasFetchedRef.current = true;
      setPosts(allPosts as unknown as PostWithProfile[]);
      setHasMore(
        friendPosts.length === PAGE_SIZE || publicRaw.length === PAGE_SIZE
      );
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
        const excludeIds = [userId, ...friendIds];
        const excludeStr = `("${excludeIds.join('","')}")`;

        const [friendResult, publicResult] = await Promise.allSettled([
          supabase
            .from('posts')
            .select(POST_SELECT)
            .in('user_id', [userId, ...friendIds])
            .lt('created_at', lastPost.created_at)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE),
          supabase
            .from('posts')
            .select(POST_SELECT)
            .not('user_id', 'in', excludeStr)
            .lt('created_at', lastPost.created_at)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE),
        ]);

        const friendPosts =
          friendResult.status === 'fulfilled' ? (friendResult.value.data ?? []) : [];
        const publicRaw =
          publicResult.status === 'fulfilled' ? (publicResult.value.data ?? []) : [];
        const publicPosts = publicRaw.filter(
          (p: { profiles?: { is_private?: boolean } }) => p.profiles?.is_private !== true
        );

        const existingIds = new Set(posts.map((p) => p.id));
        const newPosts: typeof friendPosts = [];
        for (const p of [...friendPosts, ...publicPosts]) {
          if (!existingIds.has(p.id)) {
            newPosts.push(p);
            existingIds.add(p.id);
          }
        }
        newPosts.sort(
          (a: { created_at: string }, b: { created_at: string }) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setPosts((prev) => [...prev, ...(newPosts as unknown as PostWithProfile[])]);
        setHasMore(friendPosts.length === PAGE_SIZE || publicRaw.length === PAGE_SIZE);
      } else {
        const userIds = mode === 'own' ? [userId] : [userId, ...friendIds];

        const { data, error } = await supabase
          .from('posts')
          .select(POST_SELECT)
          .in('user_id', userIds)
          .lt('created_at', lastPost.created_at)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);

        if (error) {
          if (__DEV__) console.error('Failed to load more posts:', error);
          return;
        }

        const newPosts = (data ?? []) as unknown as PostWithProfile[];
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

  return (
    <PostsContext.Provider
      value={{
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
      }}
    >
      {children}
    </PostsContext.Provider>
  );
};

export const usePosts = () => useContext(PostsContext);
