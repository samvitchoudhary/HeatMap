/**
 * NotificationsScreen.tsx
 *
 * NOTE: This file is over 600 lines. Future refactoring candidates:
 * - Extract useNotificationsList hook (fetch, pagination, markAsRead, per-row delete)
 * - Extract NotificationItem component (row rendering with avatar/icon, text, and action buttons)
 * - Extract useFriendRequestActions hook (accept/decline, shared with FriendsScreen)
 * - Move normFromUser/normPost helpers to a shared lib/notificationUtils.ts
 *
 * Notification center - reactions, comments, friend requests, tags.
 *
 * Key responsibilities:
 * - FlatList of notifications with avatars, action text, post thumbnails
 * - Tap navigates to post (Map or CardStack) or friend profile
 * - Mark as read on focus; refreshUnreadCount from context
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../lib/AuthContext';
import { useNotifications } from '../hooks';
import { theme } from '../lib/theme';
import { SmoothImage } from '../components/SmoothImage';
import { Skeleton } from '../components/Skeleton';
import { timeAgo } from '../lib/timeAgo';
import type { RootStackNavigationProp } from '../navigation/types';
import { useToast } from '../lib/ToastContext';
import { useFriendshipActions } from '../hooks/useFriendshipActions';
import { supabase } from '../lib/supabase';
import {
  markNotificationRead,
  deleteNotification,
  NOTIFICATION_LIST_SELECT,
} from '../services/notifications.service';
import { getFriendshipBetween } from '../services/friendships.service';

const NOTIFICATIONS_PAGE_SIZE = 30;

type FromUser = { display_name: string; username?: string; avatar_url: string | null } | null;
type PostInfo = { id: string; image_url: string; latitude: number; longitude: number } | null;

type NotificationWithRelations = {
  id: string;
  user_id: string;
  type: 'reaction' | 'comment' | 'friend_request' | 'friend_accept' | 'tag';
  from_user_id: string;
  post_id: string | null;
  comment_id: string | null;
  emoji: string | null;
  read: boolean;
  created_at: string;
  from_user?: FromUser;
  post?: PostInfo;
  profiles?: FromUser;
  posts?: PostInfo;
};

function normFromUser(n: NotificationWithRelations): FromUser {
  return n.from_user ?? n.profiles ?? null;
}
function normPost(n: NotificationWithRelations): PostInfo | null {
  const p = n.post ?? n.posts;
  if (!p?.image_url) return null;
  return {
    id: ('id' in p ? p.id : n.post_id) ?? '',
    image_url: p.image_url,
    latitude: p.latitude,
    longitude: p.longitude,
  };
}

/**
 * One logical row per sender+post+type for reactions/comments/tags (ids change when reaction is replaced).
 * Friend notifications stay unique by id.
 */
function dedupeNotifications(notifications: NotificationWithRelations[]): NotificationWithRelations[] {
  const seen = new Map<string, NotificationWithRelations>();

  for (const n of notifications) {
    if (n.type === 'reaction' || n.type === 'comment' || n.type === 'tag') {
      const key = `${n.from_user_id}_${n.post_id}_${n.type}`;
      const existing = seen.get(key);
      if (!existing || new Date(n.created_at) > new Date(existing.created_at)) {
        seen.set(key, n);
      }
    } else {
      seen.set(n.id, n);
    }
  }

  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/** Action text after the bold display name (inline in one Text tree). */
/** Action fragment after the sender name — reaction emoji comes from DB `notifications.emoji`. */
function getNotificationActionText(n: NotificationWithRelations): string {
  switch (n.type) {
    case 'reaction':
      return `reacted ${n.emoji ?? '❤️'} to your post`;
    case 'comment':
      return 'commented on your post';
    case 'tag':
      return 'tagged you in a post';
    case 'friend_accept':
      return 'accepted your friend request';
    default:
      return 'sent you a notification';
  }
}

export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { session, profile } = useAuth();
  const { refreshUnreadCount, markAllRead } = useNotifications();
  const { showToast } = useToast();
  const userId = session?.user?.id;

  const [notifications, setNotifications] = useState<NotificationWithRelations[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const notificationsCountRef = useRef(0);
  const notificationsRef = useRef(notifications);
  const notifFetchIdRef = useRef(0);
  const notifListRefetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifListChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { actionLoading, acceptRequest, declineRequest } = useFriendshipActions();

  /** Root stack holds FriendProfile + MainTabs; try two parents then one. */
  const getRootStackNav = useCallback((): RootStackNavigationProp | undefined => {
    return (
      (navigation.getParent()?.getParent?.() as RootStackNavigationProp | undefined) ??
      (navigation.getParent?.() as RootStackNavigationProp | undefined)
    );
  }, [navigation]);

  const navigateToProfile = useCallback(
    (targetUserId: string) => {
      if (!targetUserId) return;
      if (targetUserId === profile?.id) {
        showToast("That's you!");
        return;
      }
      getRootStackNav()?.navigate('FriendProfile', { userId: targetUserId });
    },
    [getRootStackNav, profile?.id, showToast]
  );

  notificationsCountRef.current = notifications?.length ?? 0;
  notificationsRef.current = notifications;

  const fetchNotifications = useCallback(
    async (isLoadMore = false) => {
      const fetchId = ++notifFetchIdRef.current;
      if (!userId) return;
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(notificationsRef.current === null);
      }

      const from = isLoadMore ? notificationsCountRef.current : 0;
      const to = from + NOTIFICATIONS_PAGE_SIZE - 1;

      try {
        const { data, error } = await supabase
          .from('notifications')
          .select(NOTIFICATION_LIST_SELECT)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(from, to);
        if (error) throw error;
        if (fetchId !== notifFetchIdRef.current) return;

        const raw = (data ?? []) as NotificationWithRelations[];
        const list = dedupeNotifications(raw);

        if (isLoadMore) {
          setNotifications((prev) => dedupeNotifications([...(prev ?? []), ...list]));
        } else {
          setNotifications(list);
        }
        setHasMore(list.length === NOTIFICATIONS_PAGE_SIZE);
        await refreshUnreadCount();
      } catch (err) {
        if (__DEV__) console.error('Failed to fetch notifications:', err);
      } finally {
        if (fetchId === notifFetchIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [userId, refreshUnreadCount]
  );

  /** Full list refetch — never append Realtime payloads (avoids stale rows after delete+insert). */
  const debouncedFetchNotifications = useCallback(() => {
    if (notifListRefetchDebounceRef.current) clearTimeout(notifListRefetchDebounceRef.current);
    notifListRefetchDebounceRef.current = setTimeout(() => {
      notifListRefetchDebounceRef.current = null;
      void fetchNotifications(false);
    }, 1500);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!userId) return;

    notifListChannelRef.current = supabase
      .channel(`notif-screen-list-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          debouncedFetchNotifications();
        }
      )
      .subscribe();

    return () => {
      if (notifListRefetchDebounceRef.current) {
        clearTimeout(notifListRefetchDebounceRef.current);
        notifListRefetchDebounceRef.current = null;
      }
      if (notifListChannelRef.current) {
        supabase.removeChannel(notifListChannelRef.current);
        notifListChannelRef.current = null;
      }
    };
  }, [userId, debouncedFetchNotifications]);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications(false);
    }, [fetchNotifications])
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      const timer = setTimeout(async () => {
        try {
          await markAllRead();
          setNotifications((prev) => (prev ? prev.map((n) => ({ ...n, read: true })) : []));
        } catch (err) {
          if (__DEV__) console.error('Mark all read failed:', err);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }, [userId, markAllRead])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotifications(false);
  }, [fetchNotifications]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        const { error } = await markNotificationRead(notificationId);
        if (error) throw error;
        setNotifications((prev) =>
          prev ? prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)) : []
        );
        await refreshUnreadCount();
      } catch (err) {
        if (__DEV__) console.error('Mark as read failed:', err);
      }
    },
    [refreshUnreadCount]
  );

  const handleDeleteNotification = useCallback(
    async (notificationId: string) => {
      setNotifications((prev) => (prev ?? []).filter((n) => n.id !== notificationId));

      try {
        const { error } = await deleteNotification(notificationId);
        if (error) {
          if (__DEV__) console.error('Failed to delete notification:', error);
          fetchNotifications(false);
        } else {
          await refreshUnreadCount();
        }
      } catch (err) {
        if (__DEV__) console.error('Failed to delete notification:', err);
        fetchNotifications(false);
      }
    },
    [fetchNotifications, refreshUnreadCount]
  );

  const handleNotificationPress = useCallback(
    async (n: NotificationWithRelations) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await markAsRead(n.id);

      const rootNav = getRootStackNav();

      if (n.type === 'reaction' || n.type === 'comment' || n.type === 'tag') {
        const postInfo = normPost(n);
        if (n.post_id && postInfo) {
          const { latitude, longitude } = postInfo;
          rootNav?.navigate('MainTabs', {
            screen: 'Map',
            params: {
              postId: n.post_id,
              latitude,
              longitude,
              showComments: n.type === 'comment',
            },
          });
        }
      } else if (n.type === 'friend_accept' || n.type === 'friend_request') {
        rootNav?.navigate('FriendProfile', { userId: n.from_user_id });
      }
    },
    [getRootStackNav, markAsRead]
  );

  /** Remove friend_request row from DB by notification id, then local state + badge. */
  const removeFriendRequestNotification = useCallback(
    async (notification: NotificationWithRelations) => {
      if (__DEV__) {
        console.log('Friend request notification delete:', {
          notificationId: notification.id,
          type: notification.type,
          fromUserId: notification.from_user_id,
        });
      }
      const { data, error: deleteError } = await deleteNotification(notification.id);
      if (__DEV__) {
        console.log('Delete notification result:', {
          error: deleteError,
          notificationId: notification.id,
          deletedRows: data,
        });
      }
      if (deleteError) {
        if (__DEV__) console.error('Failed to delete notification:', deleteError);
      }
      setNotifications((prev) => (prev ? prev.filter((x) => x.id !== notification.id) : []));
      await refreshUnreadCount();
    },
    [refreshUnreadCount]
  );

  const handleAcceptFriendRequest = useCallback(
    async (n: NotificationWithRelations) => {
      if (!userId || n.type !== 'friend_request') return;
      setActionLoadingId(n.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const { data: friendship, error: fsErr } = await getFriendshipBetween(userId, n.from_user_id);
        if (fsErr || !friendship?.id) {
          if (__DEV__) console.error('Failed to resolve friendship for accept:', fsErr);
          Alert.alert('Error', 'Could not find this friend request.');
          return;
        }
        if (friendship.status !== 'pending') {
          await removeFriendRequestNotification(n);
          return;
        }
        // Notification id !== friendship id — must use friendship.id for acceptRequest
        const ok = await acceptRequest(friendship.id);
        if (ok) {
          await removeFriendRequestNotification(n);
        }
      } finally {
        setActionLoadingId(null);
      }
    },
    [userId, acceptRequest, removeFriendRequestNotification]
  );

  const handleDeclineFriendRequest = useCallback(
    async (n: NotificationWithRelations) => {
      if (!userId || n.type !== 'friend_request') return;
      setActionLoadingId(n.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const { data: friendship, error: fsErr } = await getFriendshipBetween(userId, n.from_user_id);
        if (fsErr || !friendship?.id) {
          if (__DEV__) console.error('Failed to resolve friendship for decline:', fsErr);
          Alert.alert('Error', 'Could not find this friend request.');
          return;
        }
        if (friendship.status !== 'pending') {
          await removeFriendRequestNotification(n);
          return;
        }
        const ok = await declineRequest(friendship.id);
        if (ok) {
          await removeFriendRequestNotification(n);
        }
      } finally {
        setActionLoadingId(null);
      }
    },
    [userId, declineRequest, removeFriendRequestNotification]
  );

  const renderItem = ({ item }: { item: NotificationWithRelations }) => {
    const isFriendRequest = item.type === 'friend_request';
    const loading = actionLoadingId === item.id || actionLoading === item.id;
    const displayName = normFromUser(item)?.display_name ?? 'User';
    const avatarUri = normFromUser(item)?.avatar_url ?? null;
    const postThumb = normPost(item)?.image_url;
    const unreadStyle = !item.read && styles.rowUnread;

    const avatarNode = (
      <TouchableOpacity
        onPress={() => navigateToProfile(item.from_user_id)}
        activeOpacity={0.7}
        accessibilityLabel={`${displayName} profile`}
        accessibilityRole="button"
      >
        <View style={styles.avatarWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
          ) : (
            <View style={[styles.avatarImg, styles.avatarPlaceholder]}>
              <Feather name="user" size={20} color={theme.colors.textTertiary} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );

    const deleteBtn = (
      <TouchableOpacity
        onPress={() => handleDeleteNotification(item.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.rowDeleteBtn}
        activeOpacity={0.7}
        accessibilityLabel="Delete notification"
        accessibilityRole="button"
      >
        <Feather name="x" size={14} color={theme.colors.textTertiary} />
      </TouchableOpacity>
    );

    if (isFriendRequest) {
      return (
        <View style={[styles.rowFriend, unreadStyle]}>
          {avatarNode}
          <TouchableOpacity
            onPress={() => navigateToProfile(item.from_user_id)}
            style={styles.textColFriend}
            activeOpacity={0.7}
            accessibilityLabel={`${displayName} sent you a friend request`}
            accessibilityRole="button"
          >
            <Text style={styles.bodyText} numberOfLines={2}>
              <Text style={styles.nameBold}>{displayName}</Text>
              {' '}sent you a friend request
            </Text>
            <Text style={styles.timeSub}>{timeAgo(item.created_at)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleAcceptFriendRequest(item)}
            style={[styles.circleAccept, loading && styles.circleDisabled]}
            disabled={loading}
            activeOpacity={0.7}
            accessibilityLabel="Accept friend request"
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator size="small" color={theme.colors.white} />
            ) : (
              <Feather name="check" size={18} color={theme.colors.white} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDeclineFriendRequest(item)}
            style={[styles.circleDecline, loading && styles.circleDisabled]}
            disabled={loading}
            activeOpacity={0.7}
            accessibilityLabel="Decline friend request"
            accessibilityRole="button"
          >
            <Feather name="x" size={16} color={theme.colors.textTertiary} />
          </TouchableOpacity>
          {deleteBtn}
        </View>
      );
    }

    return (
      <View style={[styles.rowPost, unreadStyle]}>
        {avatarNode}
        <TouchableOpacity
          onPress={() => handleNotificationPress(item)}
          style={styles.textColPost}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${displayName} ${getNotificationActionText(item)}`}
        >
          <Text style={styles.bodyText} numberOfLines={2}>
            <Text
              style={styles.nameBold}
              onPress={() => navigateToProfile(item.from_user_id)}
              suppressHighlighting={false}
            >
              {displayName}
            </Text>
            {' '}
            {getNotificationActionText(item)}
          </Text>
        </TouchableOpacity>
        <Text style={styles.timeRight} numberOfLines={1}>
          {timeAgo(item.created_at)}
        </Text>
        {postThumb ? (
          <TouchableOpacity
            onPress={() => handleNotificationPress(item)}
            style={styles.thumbTouch}
            activeOpacity={0.7}
            accessibilityLabel="Open post"
            accessibilityRole="button"
          >
            <SmoothImage
              source={{ uri: postThumb }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.thumbSpacer} />
        )}
        {deleteBtn}
      </View>
    );
  };

  if (!userId) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <Text style={styles.title}>Notifications</Text>

      {loading && notifications === null ? (
        <View style={styles.skeletonWrap}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={40} height={40} borderRadius={20} />
              <View style={styles.skeletonRowContent}>
                <Skeleton width="80%" height={14} borderRadius={4} />
                <Skeleton width="50%" height={12} borderRadius={4} style={{ marginTop: 6 }} />
              </View>
              <Skeleton width={44} height={44} borderRadius={6} style={{ marginLeft: 8 }} />
            </View>
          ))}
        </View>
      ) : !notifications || notifications.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="bell" size={48} color={theme.colors.textTertiary} />
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptySubtitle}>
            Reactions, comments, and friend requests will appear here
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={notifications ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          removeClippedSubviews={true}
          windowSize={7}
          maxToRenderPerBatch={10}
          initialNumToRender={10}
          onEndReached={() => {
            if (hasMore && !loadingMore) fetchNotifications(true);
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={theme.colors.primary} style={{ padding: 16 }} />
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.text}
            />
          }
        />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.screenPadding,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  skeletonWrap: {
    padding: 16,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  skeletonRowContent: {
    flex: 1,
    marginLeft: 12,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  rowPost: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  rowFriend: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  rowUnread: {
    backgroundColor: 'rgba(255, 122, 143, 0.08)',
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  textColPost: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  textColFriend: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  rowDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    flexShrink: 0,
  },
  bodyText: {
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 18,
  },
  nameBold: {
    fontWeight: '700',
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 18,
  },
  timeRight: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginLeft: 8,
    flexShrink: 0,
  },
  timeSub: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: theme.colors.surface,
  },
  thumbTouch: {
    marginLeft: 8,
  },
  thumbSpacer: {
    width: 44,
    marginLeft: 8,
  },
  circleAccept: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  circleDecline: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.transparent,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  circleDisabled: {
    opacity: 0.7,
  },
});
