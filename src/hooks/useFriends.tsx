/**
 * useFriends.tsx
 *
 * Shared hook and context for friendship data.
 * Fetches once, shares across all screens.
 * Provides: friendIds, friends list, loading state, refresh function.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { CONFIG } from '../lib/config';
import { fetchAcceptedFriendships, extractFriendProfile } from '../services/friendships.service';

type FriendProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type FriendsContextType = {
  /** Array of friend user IDs (accepted friendships only) */
  friendIds: string[];
  /** Array of friend profile objects */
  friends: FriendProfile[];
  /** Whether the initial fetch is in progress */
  loading: boolean;
  /** Re-fetch friendships from the server */
  refresh: () => Promise<void>;
};

const FriendsContext = createContext<FriendsContextType>({
  friendIds: [],
  friends: [],
  loading: true,
  refresh: async () => {},
});

export const FriendsProvider: React.FC<{ userId: string; children: React.ReactNode }> = ({ userId, children }) => {
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const lastFetchRef = useRef(0);
  const hasDataRef = useRef(false);
  const friendsFetchIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const fetchId = ++friendsFetchIdRef.current;
    if (!userId) return;

    const now = Date.now();
    if (now - lastFetchRef.current < CONFIG.FRIENDS_THROTTLE_MS && hasDataRef.current) return;
    lastFetchRef.current = now;

    try {
      const { data, error } = await fetchAcceptedFriendships(userId, CONFIG.FRIENDS_LIMIT);

      if (error) {
        if (__DEV__) console.error('Failed to fetch friends:', error);
        return;
      }

      if (fetchId !== friendsFetchIdRef.current) return;

      const friendProfiles: FriendProfile[] = [];
      const ids: string[] = [];

      (data ?? []).forEach((f: any) => {
        const fp = extractFriendProfile(f, userId);
        if (fp && fp.id) {
          friendProfiles.push(fp as FriendProfile);
          ids.push(fp.id);
        }
      });

      setFriends(friendProfiles);
      setFriendIds(ids);
      hasDataRef.current = true;
    } finally {
      if (fetchId === friendsFetchIdRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({
    friendIds,
    friends,
    loading,
    refresh,
  }), [friendIds, friends, loading, refresh]);

  return (
    <FriendsContext.Provider value={value}>
      {children}
    </FriendsContext.Provider>
  );
};

export const useFriends = () => useContext(FriendsContext);
