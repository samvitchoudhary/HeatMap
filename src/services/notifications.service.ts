/**
 * notifications.service.ts
 *
 * Centralized Supabase access for the notifications table.
 * All notification-related database operations go through here.
 * No screen or component should call supabase.from('notifications') directly.
 */

import { supabase } from '../lib/supabase';
import { shouldSendNotification } from '../lib/notifications';

/** Standard select columns for notifications */
export const NOTIFICATION_SELECT = `
  id, user_id, type, from_user_id, post_id, comment_id, emoji, read, created_at
`;

type NotificationType = 'reaction' | 'comment' | 'friend_request' | 'friend_accept' | 'tag';

type BaseNotificationArgs = {
  toUserId: string;
  fromUserId: string;
  type: NotificationType;
  postId?: string | null;
  commentId?: string | null;
  emoji?: string | null;
};

async function insertNotificationIfAllowed({
  toUserId,
  fromUserId,
  type,
  postId = null,
  commentId = null,
  emoji = null,
}: BaseNotificationArgs) {
  // Never notify self
  if (!toUserId || !fromUserId || toUserId === fromUserId) {
    return { data: null, error: null };
  }

  const ok = await shouldSendNotification(toUserId, type);
  if (!ok) return { data: null, error: null };

  return supabase.from('notifications').insert({
    user_id: toUserId,
    type,
    from_user_id: fromUserId,
    post_id: postId,
    comment_id: commentId,
    emoji,
  });
}

type ReactionNotifArgs = {
  toUserId: string;
  fromUserId: string;
  postId: string;
  emoji: string;
};

/**
 * Replace any prior reaction notification from this user on this post, then insert the new one.
 * Always deletes first (so changing emoji doesn't leave duplicates). Insert only if prefs allow.
 */
export async function notifyReaction(args: ReactionNotifArgs) {
  const { toUserId, fromUserId, postId, emoji } = args;

  if (!toUserId || !fromUserId || toUserId === fromUserId) {
    return { data: null, error: null };
  }

  // DELETE must include user_id (recipient) so the row is uniquely targeted and RLS can allow sender deletes
  const { error: delErr } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', toUserId)
    .eq('from_user_id', fromUserId)
    .eq('post_id', postId)
    .eq('type', 'reaction');

  if (delErr && __DEV__) console.error('notifyReaction: delete previous reaction notification failed:', delErr);

  const ok = await shouldSendNotification(toUserId, 'reaction');
  if (!ok) return { data: null, error: null };

  return supabase.from('notifications').insert({
    user_id: toUserId,
    type: 'reaction',
    from_user_id: fromUserId,
    post_id: postId,
    emoji,
  });
}

/**
 * Remove the reaction notification when the user un-reacts (same filters as notifyReaction delete).
 */
export async function removeReactionNotification(args: {
  recipientUserId: string;
  fromUserId: string;
  postId: string;
}) {
  const { recipientUserId, fromUserId, postId } = args;
  return supabase
    .from('notifications')
    .delete()
    .eq('user_id', recipientUserId)
    .eq('from_user_id', fromUserId)
    .eq('post_id', postId)
    .eq('type', 'reaction');
}

/**
 * @deprecated Use notifyReaction — kept for any external imports; same behavior.
 */
export async function sendReactionNotification(args: ReactionNotifArgs) {
  return notifyReaction(args);
}

/**
 * Send a comment notification (if prefs allow and not self).
 */
export async function sendCommentNotification(args: {
  toUserId: string;
  fromUserId: string;
  postId: string;
  commentId?: string | null;
}) {
  return insertNotificationIfAllowed({
    toUserId: args.toUserId,
    fromUserId: args.fromUserId,
    type: 'comment',
    postId: args.postId,
    commentId: args.commentId ?? null,
  });
}

/**
 * Send friend request notification (if prefs allow and not self).
 */
export async function sendFriendRequestNotification(args: {
  toUserId: string;
  fromUserId: string;
}) {
  return insertNotificationIfAllowed({
    toUserId: args.toUserId,
    fromUserId: args.fromUserId,
    type: 'friend_request',
  });
}

/**
 * Notify the original requester that their friend request was accepted.
 */
export async function sendFriendAcceptNotification(args: { toUserId: string; fromUserId: string }) {
  return insertNotificationIfAllowed({
    toUserId: args.toUserId,
    fromUserId: args.fromUserId,
    type: 'friend_accept',
  });
}

/**
 * Remove the pending friend_request notification for the recipient (addressee).
 * Call after accept or decline so the row does not reappear on refetch.
 */
export async function deleteFriendRequestNotificationForPair(
  recipientUserId: string,
  requesterUserId: string
) {
  return supabase
    .from('notifications')
    .delete()
    .eq('user_id', recipientUserId)
    .eq('from_user_id', requesterUserId)
    .eq('type', 'friend_request');
}

/**
 * Send tag notifications to multiple users.
 * Applies preference and self-notification checks per user.
 */
export async function sendTagNotifications(args: {
  fromUserId: string;
  postId: string;
  taggedUserIds: string[];
}) {
  const { fromUserId, postId, taggedUserIds } = args;
  const payloads: { user_id: string; type: NotificationType; from_user_id: string; post_id: string }[] = [];

  for (const toUserId of taggedUserIds) {
    if (!toUserId || toUserId === fromUserId) continue;
    const ok = await shouldSendNotification(toUserId, 'tag');
    if (!ok) continue;
    payloads.push({
      user_id: toUserId,
      type: 'tag',
      from_user_id: fromUserId,
      post_id: postId,
    });
  }

  if (payloads.length === 0) {
    return { data: null, error: null };
  }

  return supabase.from('notifications').insert(payloads);
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(notificationId: string) {
  return supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);
}

/**
 * Delete a single notification by primary key (used after friend request accept/decline).
 * `.select('id')` returns deleted row(s) so callers can verify the delete in __DEV__.
 */
export async function deleteNotification(notificationId: string) {
  if (!notificationId) return { data: null, error: null };
  return supabase.from('notifications').delete().eq('id', notificationId).select('id');
}

/**
 * Delete multiple notifications by ID.
 */
export async function deleteNotifications(ids: string[]) {
  if (ids.length === 0) return { data: null, error: null };
  return supabase.from('notifications').delete().in('id', ids);
}

