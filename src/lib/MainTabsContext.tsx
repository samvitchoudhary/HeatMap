import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

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

export function MainTabsProvider({
  children,
  onNavigateToFriendProfile,
}: {
  children: React.ReactNode;
  onNavigateToFriendProfile: (userId: string) => void;
}) {
  const [currentPage, setCurrentPage] = useState(0);
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
