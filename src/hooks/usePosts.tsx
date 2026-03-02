/**
 * usePosts.tsx
 *
 * Shared hook and context for posts data.
 * Provides a central cache of posts that all screens read from.
 * When a post is created, deleted, or reacted to, all screens see the update.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { withRetry } from '../lib/retry';
import type { PostWithProfile } from '../types';

type PostsContextType = {
  /** All fetched posts (map + feed) */
  posts: PostWithProfile[];
  /** Whether the initial fetch is in progress */
  loading: boolean;
  /** Fetch all posts (for map — all friends' posts) */
  fetchAllPosts: (friendIds: string[], userId: string) => Promise<void>;
  /** Add a newly created post to the cache */
  addPost: (post: PostWithProfile) => void;
  /** Remove a post from the cache */
  removePost: (postId: string) => void;
  /** Force refresh */
  refresh: (friendIds: string[], userId: string) => Promise<void>;
};

const PostsContext = createContext<PostsContextType>({
  posts: [],
  loading: true,
  fetchAllPosts: async () => {},
  addPost: () => {},
  removePost: () => {},
  refresh: async () => {},
});

export const PostsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [posts, setPosts] = useState<PostWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const lastFetchRef = useRef(0);
  const hasFetchedRef = useRef(false);
  const postsFetchIdRef = useRef(0);

  const fetchAllPosts = useCallback(async (friendIds: string[], userId: string) => {
    const fetchId = ++postsFetchIdRef.current;
    const now = Date.now();
    if (now - lastFetchRef.current < 15000 && hasFetchedRef.current) return;
    lastFetchRef.current = now;

    try {
      const allUserIds = [userId, ...friendIds];
      const { data, error } = await withRetry(async () => {
        const result = await supabase
          .from('posts')
          .select('id, user_id, image_url, caption, latitude, longitude, venue_name, created_at, category, profiles:user_id(username, display_name, avatar_url), post_tags(tagged_user_id, profiles:tagged_user_id(display_name, username))')
          .in('user_id', allUserIds)
          .order('created_at', { ascending: false })
          .limit(200);
        if (result.error) throw result.error;
        return result;
      });

      if (error) {
        if (__DEV__) console.error('Failed to fetch posts:', error);
        return;
      }

      if (fetchId !== postsFetchIdRef.current) return;

      hasFetchedRef.current = true;
      setPosts((data ?? []) as unknown as PostWithProfile[]);
    } finally {
      if (fetchId === postsFetchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const addPost = useCallback((post: PostWithProfile) => {
    setPosts((prev) => [post, ...prev]);
  }, []);

  const removePost = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const refresh = useCallback(async (friendIds: string[], userId: string) => {
    lastFetchRef.current = 0;
    hasFetchedRef.current = false;
    await fetchAllPosts(friendIds, userId);
  }, [fetchAllPosts]);

  return (
    <PostsContext.Provider value={{ posts, loading, fetchAllPosts, addPost, removePost, refresh }}>
      {children}
    </PostsContext.Provider>
  );
};

export const usePosts = () => useContext(PostsContext);
