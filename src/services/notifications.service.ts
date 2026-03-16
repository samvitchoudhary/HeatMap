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

type NotificationType = 'reaction' | 'comment' | 'friend_request' | 'tag';

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

/**
 * Send a reaction notification (if prefs allow and not self).
 */
export async function sendReactionNotification(args: {
  toUserId: string;
  fromUserId: string;
  postId: string;
  emoji: string;
}) {
  return insertNotificationIfAllowed({
    toUserId: args.toUserId,
    fromUserId: args.fromUserId,
    type: 'reaction',
    postId: args.postId,
    emoji: args.emoji,
  });
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
 * Delete multiple notifications by ID.
 */
export async function deleteNotifications(ids: string[]) {
  if (ids.length === 0) return { data: null, error: null };
  return supabase.from('notifications').delete().in('id', ids);
}

