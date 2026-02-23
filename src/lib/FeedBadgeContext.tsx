import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { supabase } from './supabase';

const FEED_LAST_SEEN_KEY = 'feed_last_seen';

type FeedBadgeContextValue = {
  hasNewPosts: boolean;
  markFeedSeen: () => Promise<void>;
  lastSeenAt: string | null;
};

const FeedBadgeContext = createContext<FeedBadgeContextValue | null>(null);

export function FeedBadgeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [hasNewPosts, setHasNewPosts] = useState(false);

  const loadLastSeen = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(FEED_LAST_SEEN_KEY);
      setLastSeenAt(stored);
      return stored;
    } catch {
      return null;
    }
  }, []);

  const markFeedSeen = useCallback(async () => {
    const now = new Date().toISOString();
    try {
      await AsyncStorage.setItem(FEED_LAST_SEEN_KEY, now);
      setLastSeenAt(now);
      setHasNewPosts(false);
    } catch {
      setLastSeenAt(now);
      setHasNewPosts(false);
    }
  }, []);

  const checkForNewPosts = useCallback(async () => {
    if (!profile?.id) return;
    const lastSeen = lastSeenAt ?? (await loadLastSeen());
    if (!lastSeen) {
      setHasNewPosts(false);
      return;
    }

    try {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`)
        .eq('status', 'accepted');

      const friendIds =
        friendships?.map((f) =>
          f.requester_id === profile.id ? f.addressee_id : f.requester_id
        ) ?? [];

      if (friendIds.length === 0) {
        setHasNewPosts(false);
        return;
      }

      const { count } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', lastSeen)
        .neq('user_id', profile.id)
        .in('user_id', friendIds);

      if (__DEV__) {
        console.log('[FeedBadge] Friend IDs:', friendIds, 'New posts count:', count);
      }
      setHasNewPosts((count ?? 0) > 0);
    } catch {
      setHasNewPosts(false);
    }
  }, [profile?.id, lastSeenAt, loadLastSeen]);

  useEffect(() => {
    loadLastSeen();
  }, [loadLastSeen]);

  useEffect(() => {
    checkForNewPosts();
    const interval = setInterval(checkForNewPosts, 60000);
    return () => clearInterval(interval);
  }, [checkForNewPosts]);

  const value: FeedBadgeContextValue = { hasNewPosts, markFeedSeen, lastSeenAt };
  return (
    <FeedBadgeContext.Provider value={value}>{children}</FeedBadgeContext.Provider>
  );
}

export function useFeedBadge() {
  const ctx = useContext(FeedBadgeContext);
  if (!ctx) throw new Error('useFeedBadge must be used within FeedBadgeProvider');
  return ctx;
}
