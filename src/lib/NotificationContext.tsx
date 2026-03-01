/**
 * NotificationContext.tsx
 *
 * Unread notification count for the Notifications tab badge.
 *
 * Key responsibilities:
 * - Fetches unread count from notifications table
 * - Refreshes on screen focus (when user returns to app) and on 30s interval
 * - Exposes refreshUnreadCount for NotificationsScreen to call after marking read
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from './AuthContext';
import { supabase } from './supabase';

type NotificationContextType = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextType | null>(null);

/** How often to poll for new notifications when app is in foreground */
const POLL_INTERVAL_MS = 30000;

/** Provider that manages unread notification count */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  /** Count of notifications with read=false for current user */
  const [unreadCount, setUnreadCount] = useState(0);

  /** Queries notifications table for unread count */
  const fetchUnreadCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
    setUnreadCount(count ?? 0);
  }, [userId]);

  /** Refresh count when Notifications tab or any screen comes into focus */
  useFocusEffect(
    useCallback(() => {
      fetchUnreadCount();
    }, [fetchUnreadCount])
  );

  /** Poll for new notifications every 30 seconds */
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userId, fetchUnreadCount]);

  const refreshUnreadCount = useCallback(async () => {
    await fetchUnreadCount();
  }, [fetchUnreadCount]);

  return (
    <NotificationContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  return ctx ?? { unreadCount: 0, refreshUnreadCount: async () => {} };
}
