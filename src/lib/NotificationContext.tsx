import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from './AuthContext';
import { supabase } from './supabase';

type NotificationContextType = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextType | null>(null);

const POLL_INTERVAL_MS = 30000;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
    setUnreadCount(count ?? 0);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      fetchUnreadCount();
    }, [fetchUnreadCount])
  );

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
