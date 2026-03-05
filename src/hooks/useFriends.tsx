/**
 * useFriends.tsx
 *
 * Shared hook and context for friendship data.
 * Fetches once, shares across all screens.
 * Provides: friendIds, friends list, loading state, refresh function.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

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
    if (now - lastFetchRef.current < 10000 && hasDataRef.current) return;
    lastFetchRef.current = now;

    try {
      const { data, error } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id, requester:requester_id(id, username, display_name, avatar_url), addressee:addressee_id(id, username, display_name, avatar_url)')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .limit(500);

      if (error) {
        if (__DEV__) console.error('Failed to fetch friends:', error);
        return;
      }

      if (fetchId !== friendsFetchIdRef.current) return;

      const friendProfiles: FriendProfile[] = [];
      const ids: string[] = [];

      (data ?? []).forEach((f: Record<string, unknown>) => {
        const requester = Array.isArray(f.requester) ? f.requester[0] : f.requester;
        const addressee = Array.isArray(f.addressee) ? f.addressee[0] : f.addressee;
        const friend = f.requester_id === userId ? addressee : requester;
        const fp = friend as FriendProfile | null | undefined;
        if (fp && fp.id) {
          friendProfiles.push(fp);
          ids.push(fp.id);
        }
      });

      setFriends(friendProfiles);
      setFriendIds(ids);
      hasDataRef.current = ids.length > 0;
    } finally {
      if (fetchId === friendsFetchIdRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <FriendsContext.Provider value={{ friendIds, friends, loading, refresh }}>
      {children}
    </FriendsContext.Provider>
  );
};

export const useFriends = () => useContext(FriendsContext);
