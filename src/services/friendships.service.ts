/**
 * friendships.service.ts
 *
 * Centralized Supabase queries for the friendships table.
 * All friendship-related database operations go through here.
 * No screen or component should call supabase.from('friendships') directly.
 */

import { supabase } from '../lib/supabase';
import {
  sendFriendRequestNotification,
} from './notifications.service';

/** Standard select for friendships with profile joins */
const FRIENDSHIP_SELECT = `
  id, status, requester_id, addressee_id,
  requester:requester_id(id, username, display_name, avatar_url),
  addressee:addressee_id(id, username, display_name, avatar_url)
`;

/**
 * Fetch all accepted friendships for a user.
 */
export async function fetchAcceptedFriendships(userId: string, limit: number = 500) {
  return supabase
    .from('friendships')
    .select(FRIENDSHIP_SELECT)
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .limit(limit);
}

/**
 * Fetch ALL friendships for a user (any status: accepted, pending, declined).
 */
export async function fetchAllFriendships(userId: string, limit: number = 500) {
  return supabase
    .from('friendships')
    .select(FRIENDSHIP_SELECT)
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .limit(limit);
}

/**
 * Get the friendship record between two specific users.
 * Returns null if no friendship exists.
 */
export async function getFriendshipBetween(userId1: string, userId2: string) {
  return supabase
    .from('friendships')
    .select('id, status, requester_id, addressee_id')
    .or(
      `and(requester_id.eq.${userId1},addressee_id.eq.${userId2}),and(requester_id.eq.${userId2},addressee_id.eq.${userId1})`
    )
    .limit(1)
    .maybeSingle();
}

/**
 * Send a friend request.
 * Also sends a notification to the recipient.
 */
export async function sendFriendRequest(fromUserId: string, toUserId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .insert({
      requester_id: fromUserId,
      addressee_id: toUserId,
      status: 'pending',
    })
    .select('id, status, requester_id, addressee_id')
    .single();

  if (!error && data) {
    await sendFriendRequestNotification({ toUserId, fromUserId });
  }

  return { data, error };
}

/**
 * Accept a friend request.
 * Optionally a notification for accept can be added later.
 */
export async function acceptFriendRequest(friendshipId: string) {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);

  return { error };
}

/**
 * Decline a friend request.
 */
export async function declineFriendRequest(friendshipId: string) {
  return supabase
    .from('friendships')
    .update({ status: 'declined' })
    .eq('id', friendshipId);
}

/**
 * Remove a friendship (unfriend).
 */
export async function removeFriendship(friendshipId: string) {
  return supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);
}

/**
 * Cancel a pending friend request that you sent.
 */
export async function cancelFriendRequest(friendshipId: string) {
  return supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);
}

/**
 * Get friend count for a user.
 */
export async function getFriendCount(userId: string) {
  return supabase
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
}

/**
 * Search profiles by username (for adding new friends).
 */
export async function searchProfiles(query: string, excludeUserId: string, limit: number = 20) {
  return supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .ilike('username', `%${query}%`)
    .neq('id', excludeUserId)
    .limit(limit);
}

/**
 * Extract the friend profile from a friendship row.
 * Given a friendship row and the current user's ID, returns the OTHER user's profile.
 */
export function extractFriendProfile(
  friendship: any,
  currentUserId: string
): { id: string; username: string; display_name: string; avatar_url: string | null } | null {
  const requester = Array.isArray(friendship.requester) ? friendship.requester[0] : friendship.requester;
  const addressee = Array.isArray(friendship.addressee) ? friendship.addressee[0] : friendship.addressee;
  const friend = friendship.requester_id === currentUserId ? addressee : requester;
  return friend ?? null;
}

