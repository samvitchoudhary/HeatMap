/**
 * notifications.ts
 *
 * Helper for checking user notification preferences before sending.
 */

import { supabase } from './supabase';

/**
 * Check if a user wants to receive a specific notification type.
 * Reads from the profiles.notification_prefs jsonb column.
 */
export async function shouldSendNotification(
  userId: string,
  type: 'reaction' | 'comment' | 'friend_request' | 'tag'
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('notification_prefs')
      .eq('id', userId)
      .single();

    if (!data?.notification_prefs) return true; // default: send

    const prefs = data.notification_prefs as Record<string, boolean>;

    // Master toggle off = no notifications
    if (prefs.all === false) return false;

    // Map notification type to pref key
    const keyMap: Record<string, string> = {
      reaction: 'reactions',
      comment: 'comments',
      friend_request: 'friend_requests',
      tag: 'tags',
    };

    const key = keyMap[type];
    if (key && prefs[key] === false) return false;

    return true;
  } catch {
    return true; // on error, default to sending
  }
}
