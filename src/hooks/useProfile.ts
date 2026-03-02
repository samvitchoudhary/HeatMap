/**
 * useProfile.ts - Profile data fetching for ProfileScreen.
 */

import { useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import type { PostWithProfile } from '../types';

export function useProfile(
  userId: string | undefined,
  friendIds: string[],
  refreshProfile: () => Promise<void>,
  refreshFriends: () => Promise<void>
) {
  const [posts, setPosts] = useState<PostWithProfile[]>([]);
  const [postsCount, setPostsCount] = useState(0);
  const [profileDataReady, setProfileDataReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const hasInitiallyFetched = useRef(false);

  const fetchMyPosts = useCallback(async () => {
    if (!userId) return;
    const { data: ownData, error: ownError } = await supabase
      .from('posts')
      .select('id, image_url, caption, latitude, longitude, created_at, user_id, venue_name, category, profiles:user_id(username, display_name, avatar_url), post_tags(tagged_user_id, profiles:tagged_user_id(display_name, username))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (ownError) {
      if (__DEV__) console.error('Error fetching profile posts:', ownError);
      return;
    }
    const ownPosts = (ownData ?? []) as PostWithProfile[];
    const { data: taggedData } = await supabase
      .from('post_tags')
      .select('post_id, posts:post_id(id, image_url, caption, latitude, longitude, created_at, user_id, venue_name, category, profiles:user_id(username, display_name, avatar_url), post_tags(tagged_user_id, profiles:tagged_user_id(display_name, username)))')
      .eq('tagged_user_id', userId)
      .limit(100);
    const taggedPosts = ((taggedData ?? []) as { post_id: string; posts: PostWithProfile }[])
      .map((t) => t.posts)
      .filter((p): p is PostWithProfile => !!p && friendIds.includes(p.user_id));
    const merged = [...ownPosts];
    const ownIds = new Set(ownPosts.map((p) => p.id));
    for (const p of taggedPosts) {
      if (!ownIds.has(p.id)) {
        merged.push(p);
        ownIds.add(p.id);
      }
    }
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setPosts(merged);
  }, [userId, friendIds]);

  const fetchPostsCount = useCallback(async () => {
    if (!userId) return;
    const { count, error } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (!error) setPostsCount(count ?? 0);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      const isInitial = !hasInitiallyFetched.current;
      hasInitiallyFetched.current = true;
      let mounted = true;
      if (isInitial) setProfileDataReady(false);
      Promise.all([fetchMyPosts(), fetchPostsCount()]).then(() => {
        if (mounted) setProfileDataReady(true);
      });
      return () => { mounted = false; };
    }, [fetchMyPosts, fetchPostsCount])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchMyPosts(), fetchPostsCount(), refreshFriends()]);
    await refreshProfile();
    setRefreshing(false);
  }, [fetchMyPosts, fetchPostsCount, refreshFriends, refreshProfile]);

  return {
    posts,
    setPosts,
    postsCount,
    setPostsCount,
    profileDataReady,
    refreshing,
    handleRefresh,
    fetchMyPosts,
    fetchPostsCount,
  };
}
