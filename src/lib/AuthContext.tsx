/**
 * AuthContext.tsx
 *
 * Authentication state and profile management.
 *
 * Key responsibilities:
 * - Provides session (Supabase auth) and profile (profiles table) to the app
 * - Listens to auth state changes (login, logout, token refresh)
 * - Fetches and caches profile data; exposes refreshProfile for avatar/username updates
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';
import type { Profile } from '../types';

/** Auth context value - session, profile, loading state, and profile refresh */
type AuthContextType = {
  session: { user: { id: string } } | null;
  profile: Profile | null | undefined;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * AuthProvider
 *
 * Wraps the app and provides auth state. Fetches profile on init and on auth changes.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  /** Supabase session - null when logged out */
  const [session, setSession] = useState<{ user: { id: string } } | null>(null);
  /** Profile from profiles table - undefined during initial load, null if not found */
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  /** True until initial session check completes */
  const [loading, setLoading] = useState(true);

  /**
   * Fetches profile from profiles table for the given user ID.
   * Sets profile to null on error or missing data.
   */
  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_private, notification_prefs, theme_preference')
      .eq('id', userId)
      .single();
    setProfile(error || !data ? null : (data as Profile));
  }

  /** Re-fetches profile from server - call after avatar/username update */
  const refreshProfile = React.useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      await fetchProfile(user.id);
    } else {
      setProfile(null);
    }
  }, []);

  /**
   * Initializes auth: loads session, fetches profile, subscribes to auth state changes.
   * Cleans up subscription on unmount and guards async updates with mounted flag.
   */
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const {
          data: { session: s },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (!mounted) return;

        if (sessionError) {
          if (__DEV__) console.error('Failed to get session:', sessionError);
          setSession(null);
          setProfile(null);
          return;
        }

        setSession(s as { user: { id: string } } | null);

        if (s?.user?.id) {
          try {
            await fetchProfile(s.user.id);
          } catch (err) {
            if (__DEV__) console.error('Profile fetch error:', err);
            if (mounted) setProfile(null);
          }
        } else {
          setProfile(null);
        }
      } catch (err) {
        if (__DEV__) console.error('Auth init error:', err);
        if (mounted) {
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      try {
        setSession(s as { user: { id: string } } | null);
        if (s?.user?.id) {
          await fetchProfile(s.user.id);
        } else {
          setProfile(null);
        }
      } catch (err) {
        if (__DEV__) console.error('Auth state change error:', err);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          if (__DEV__) console.error('Auth loading timed out after 10 seconds');
          return false;
        }
        return prev;
      });
    }, 10000);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Hook to access auth context - throws if used outside AuthProvider */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
