/**
 * FeedBadgeContext.tsx
 *
 * "New posts" badge for the Feed tab.
 *
 * Key responsibilities:
 * - Persists last-seen timestamp when user views the feed (AsyncStorage)
 * - Polls for posts from friends created after lastSeenAt
 * - Exposes hasNewPosts for tab badge, markFeedSeen to clear on feed view
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { supabase } from './supabase';

/** AsyncStorage key for feed last-seen ISO timestamp */
const FEED_LAST_SEEN_KEY = 'feed_last_seen';

type FeedBadgeContextValue = {
  hasNewPosts: boolean;
  markFeedSeen: () => Promise<void>;
  lastSeenAt: string | null;
};

const FeedBadgeContext = createContext<FeedBadgeContextValue | null>(null);

/** Provider that manages feed badge state */
export function FeedBadgeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  /** ISO timestamp of when user last viewed the feed */
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  /** True if friends have posted since lastSeenAt */
  const [hasNewPosts, setHasNewPosts] = useState(false);

  /** Loads lastSeenAt from AsyncStorage */
  const loadLastSeen = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(FEED_LAST_SEEN_KEY);
      setLastSeenAt(stored);
      return stored;
    } catch {
      return null;
    }
  }, []);

  /** Saves current time as lastSeenAt and clears the badge */
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

  /**
   * Counts posts from friends created after lastSeen.
   * Uses friendships to get friend IDs, then counts posts in that set.
   */
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
        .eq('status', 'accepted')
        .limit(500);

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
        .select('id', { count: 'exact', head: true })
        .gt('created_at', lastSeen)
        .neq('user_id', profile.id)
        .in('user_id', friendIds)
        .limit(50);

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

  /** Poll for new posts on mount and every 60 seconds */
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
