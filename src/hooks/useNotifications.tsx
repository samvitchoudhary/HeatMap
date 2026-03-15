/**
 * useNotifications.tsx
 *
 * Shared hook and context for notifications.
 * Provides unread count (for badge) and refresh/markAllRead.
 * Uses Supabase Realtime instead of polling for live badge updates.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

type NotificationsContextType = {
  /** Number of unread notifications */
  unreadCount: number;
  /** Refresh the unread count */
  refreshUnreadCount: () => Promise<void>;
  /** Mark all as read */
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextType>({
  unreadCount: 0,
  refreshUnreadCount: async () => {},
  markAllRead: async () => {},
});

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [unreadCount, setUnreadCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refreshUnreadCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false);
      if (!error && count !== null) setUnreadCount(count);
    } catch (err) {
      if (__DEV__) console.error('Failed to fetch unread count:', err);
    }
  }, [userId]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);
      if (!error) setUnreadCount(0);
    } catch (err) {
      if (__DEV__) console.error('Mark all read failed:', err);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      refreshUnreadCount();
    }, [refreshUnreadCount])
  );

  useEffect(() => {
    if (!userId) return;

    refreshUnreadCount();

    channelRef.current = supabase
      .channel(`notif-badge-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setUnreadCount((prev) => prev + 1);
          } else if (payload.eventType === 'DELETE') {
            setUnreadCount((prev) => Math.max(0, prev - 1));
          } else if (payload.eventType === 'UPDATE') {
            const newRow = payload.new as Record<string, unknown>;
            const oldRow = payload.old as Record<string, unknown>;
            if (newRow?.read === true && oldRow?.read === false) {
              setUnreadCount((prev) => Math.max(0, prev - 1));
            }
          }
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, refreshUnreadCount]);

  const value = useMemo(() => ({
    unreadCount,
    refreshUnreadCount,
    markAllRead,
  }), [unreadCount, refreshUnreadCount, markAllRead]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationsContext);
