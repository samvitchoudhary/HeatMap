/**
 * notifications.ts
 *
 * Helper for checking user notification preferences before sending.
 */

import { supabase } from './supabase';

/**
 * Simple TTL cache for notification preferences.
 * Avoids hitting the database on every reaction/comment/tag.
 */
const prefsCache = new Map<string, { prefs: Record<string, boolean>; expiresAt: number }>();
const CACHE_TTL = 60000; // 1 minute

const KEY_MAP: Record<string, string> = {
  reaction: 'reactions',
  comment: 'comments',
  friend_request: 'friend_requests',
  tag: 'tags',
};

const DEFAULT_PREFS: Record<string, boolean> = {
  all: true,
  reactions: true,
  comments: true,
  friend_requests: true,
  tags: true,
};

function checkPrefs(prefs: Record<string, boolean>, type: string): boolean {
  if (prefs.all === false) return false;
  const key = KEY_MAP[type];
  if (key && prefs[key] === false) return false;
  return true;
}

/**
 * Check if a user wants to receive a specific notification type.
 * Reads from the profiles.notification_prefs jsonb column, with 1-minute TTL cache.
 */
export async function shouldSendNotification(
  userId: string,
  type: 'reaction' | 'comment' | 'friend_request' | 'tag'
): Promise<boolean> {
  try {
    const now = Date.now();

    const cached = prefsCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return checkPrefs(cached.prefs, type);
    }

    const { data } = await supabase
      .from('profiles')
      .select('notification_prefs')
      .eq('id', userId)
      .single();

    if (!data?.notification_prefs) {
      prefsCache.set(userId, { prefs: DEFAULT_PREFS, expiresAt: now + CACHE_TTL });
      return true;
    }

    const prefs = data.notification_prefs as Record<string, boolean>;
    prefsCache.set(userId, { prefs, expiresAt: now + CACHE_TTL });

    return checkPrefs(prefs, type);
  } catch {
    return true;
  }
}
