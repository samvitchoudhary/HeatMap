/**
 * supabase.ts
 *
 * Supabase client configuration and initialization.
 *
 * Key responsibilities:
 * - Creates the Supabase client with project URL and anon key
 * - Configures auth to use SecureStore for persistent session storage (required for React Native)
 * - Enables auto-refresh of tokens and session persistence across app restarts
 */

import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

/**
 * SecureStore adapter for Supabase auth.
 * Supabase expects an async storage interface; Expo's SecureStore provides encrypted storage
 * for auth tokens instead of AsyncStorage (more secure for sensitive credentials).
 */
const SecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    await SecureStore.deleteItemAsync(key);
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/** Supabase client instance - use for all database, auth, and storage operations */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
