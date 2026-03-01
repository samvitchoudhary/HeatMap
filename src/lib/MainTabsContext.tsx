/**
 * MainTabsContext.tsx
 *
 * Tab navigation and cross-tab navigation helpers.
 *
 * Key responsibilities:
 * - Tracks current tab page (Map, Feed, Notifications, Profile)
 * - navigateToMap with params lets Feed/other screens open map at a location or post
 * - navigateToFriendProfile lets CardStack open a friend's profile without tight coupling
 */

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

/** Params passed when navigating to Map tab (e.g. from Feed venue tap) */
export type MapParams = {
  postId?: string;
  latitude?: number;
  longitude?: number;
  showComments?: boolean;
};

type MainTabsContextValue = {
  currentPage: number;
  setPage: (index: number) => void;
  navigateToFriendProfile: (userId: string) => void;
  navigateToMap: (params?: MapParams) => void;
  setMapParamsRef: React.MutableRefObject<MapParams | null>;
};

const MainTabsContext = createContext<MainTabsContextValue | null>(null);

/** Provider for tab state and navigation helpers */
export function MainTabsProvider({
  children,
  onNavigateToFriendProfile,
}: {
  children: React.ReactNode;
  onNavigateToFriendProfile: (userId: string) => void;
}) {
  /** Active tab index: 0=Map, 1=Feed, 2=Notifications, 3=Profile */
  const [currentPage, setCurrentPage] = useState(0);
  /** Stores params for next Map navigation - MapStack reads this on mount/focus */
  const setMapParamsRef = useRef<MapParams | null>(null);

  const setPage = useCallback((index: number) => {
    setCurrentPage(index);
  }, []);

  const navigateToFriendProfile = useCallback(
    (userId: string) => {
      onNavigateToFriendProfile(userId);
    },
    [onNavigateToFriendProfile]
  );

  const navigateToMap = useCallback((params?: MapParams) => {
    if (params) {
      setMapParamsRef.current = params;
    }
    setCurrentPage(0);
  }, []);

  const value: MainTabsContextValue = {
    currentPage,
    setPage,
    navigateToFriendProfile,
    navigateToMap,
    setMapParamsRef,
  };
  return (
    <MainTabsContext.Provider value={value}>{children}</MainTabsContext.Provider>
  );
}

export function useMainTabs() {
  const ctx = useContext(MainTabsContext);
  if (!ctx) throw new Error('useMainTabs must be used within MainTabsProvider');
  return ctx;
}
