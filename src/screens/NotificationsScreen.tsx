/**
 * NotificationsScreen.tsx
 *
 * NOTE: This file is over 600 lines. Future refactoring candidates:
 * - Extract useNotificationsList hook (fetch, pagination, markAsRead, bulk delete, select mode)
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

import React, { useState, useCallback, useRef } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../lib/AuthContext';
import { useNotifications } from '../hooks';
import { theme } from '../lib/theme';
import { Avatar } from '../components/Avatar';
import { SmoothImage } from '../components/SmoothImage';
import { Skeleton } from '../components/Skeleton';
import { timeAgo } from '../lib/timeAgo';
import type { RootStackNavigationProp } from '../navigation/types';
import { useToast } from '../lib/ToastContext';
import { useFriendshipActions } from '../hooks/useFriendshipActions';
import { supabase } from '../lib/supabase';
import { markNotificationRead, deleteNotifications } from '../services/notifications.service';

const NOTIFICATIONS_PAGE_SIZE = 30;

type FromUser = { display_name: string; username?: string; avatar_url: string | null } | null;
type PostInfo = { id: string; image_url: string; latitude: number; longitude: number } | null;

type NotificationWithRelations = {
  id: string;
  user_id: string;
  type: 'reaction' | 'comment' | 'friend_request' | 'tag';
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

export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { session } = useAuth();
  const { refreshUnreadCount, markAllRead } = useNotifications();
  const { showToast } = useToast();
  const userId = session?.user?.id;

  const [notifications, setNotifications] = useState<NotificationWithRelations[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const notificationsCountRef = useRef(0);
  const notificationsRef = useRef(notifications);
  const notifFetchIdRef = useRef(0);
  const { actionLoading, acceptRequest, declineRequest } = useFriendshipActions();

  /** Root stack holds FriendProfile + MainTabs; try two parents then one. */
  const getRootStackNav = useCallback((): RootStackNavigationProp | undefined => {
    return (
      (navigation.getParent()?.getParent?.() as RootStackNavigationProp | undefined) ??
      (navigation.getParent?.() as RootStackNavigationProp | undefined)
    );
  }, [navigation]);

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
          .select(
            '*, from_user:from_user_id(display_name, username, avatar_url), post:post_id(id, image_url, latitude, longitude)'
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(from, to);
        if (error) throw error;
        if (fetchId !== notifFetchIdRef.current) return;

        const list = (data ?? []) as NotificationWithRelations[];

        if (isLoadMore) {
          setNotifications((prev) => [...(prev ?? []), ...list]);
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

  useFocusEffect(
    useCallback(() => {
      fetchNotifications(false);
    }, [fetchNotifications])
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        setSelectMode(false);
        setSelectedIds(new Set());
      };
    }, [])
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

  const handleBulkDeleteNotifications = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setNotifications((prev) => (prev ?? []).filter((n) => !selectedIds.has(n.id)));
    setSelectMode(false);
    setSelectedIds(new Set());
    try {
      const { error } = await deleteNotifications(ids);
      if (error) throw error;
      await refreshUnreadCount();
    } catch (err) {
      if (__DEV__) console.error('Failed to bulk delete notifications:', err);
      fetchNotifications(false);
    }
  }, [selectedIds, fetchNotifications, refreshUnreadCount]);

  const handleLongPress = useCallback((notificationId: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([notificationId]));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleNotificationPress = useCallback(
    async (n: NotificationWithRelations) => {
      if (selectMode) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(n.id)) {
            next.delete(n.id);
            if (next.size === 0) setSelectMode(false);
          } else {
            next.add(n.id);
          }
          return next;
        });
        return;
      }

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
      } else if (n.type === 'friend_request') {
        rootNav?.navigate('FriendProfile', { userId: n.from_user_id });
      }
    },
    [selectMode, getRootStackNav, markAsRead]
  );

  const handleAcceptFriendRequest = useCallback(
    async (n: NotificationWithRelations) => {
      if (!userId || n.type !== 'friend_request') return;
      setActionLoadingId(n.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        // Accept the pending friendship (ID is not present here; service handles lookup)
        const ok = await acceptRequest(n.id);
        if (ok) {
          await markAsRead(n.id);
          setNotifications((prev) => (prev ? prev.filter((x) => x.id !== n.id) : []));
        }
      } finally {
        setActionLoadingId(null);
      }
    },
    [userId, acceptRequest, markAsRead]
  );

  const handleDeclineFriendRequest = useCallback(
    async (n: NotificationWithRelations) => {
      if (!userId || n.type !== 'friend_request') return;
      setActionLoadingId(n.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const ok = await declineRequest(n.id);
        if (ok) {
          await markAsRead(n.id);
          setNotifications((prev) => (prev ? prev.filter((x) => x.id !== n.id) : []));
        }
      } finally {
        setActionLoadingId(null);
      }
    },
    [userId, declineRequest, markAsRead]
  );

  const getNotificationText = (n: NotificationWithRelations) => {
    const from = normFromUser(n);
    const name = from?.display_name ?? 'Deleted User';
    if (n.type === 'reaction') {
      return { bold: name, rest: ` reacted ${n.emoji ?? '👍'} to your post` };
    }
    if (n.type === 'comment') {
      return { bold: name, rest: ' commented on your post' };
    }
    if (n.type === 'tag') {
      return { bold: name, rest: ' tagged you in a post' };
    }
    return { bold: name, rest: ' sent you a friend request' };
  };

  const handleSenderProfilePress = useCallback(
    (n: NotificationWithRelations) => {
      const fromId = n.from_user_id;
      if (!fromId) return;
      if (fromId === userId) {
        showToast("That's you!");
        return;
      }
      getRootStackNav()?.navigate('FriendProfile', { userId: fromId });
    },
    [getRootStackNav, userId, showToast]
  );

  const renderItem = ({ item }: { item: NotificationWithRelations }) => {
    const { bold, rest } = getNotificationText(item);
    const isFriendRequest = item.type === 'friend_request';
    const loading = actionLoadingId === item.id || actionLoading === item.id;
    const isSelected = selectedIds.has(item.id);

    const rowContent = (
      <>
        {selectMode && (
          <View
            style={[
              styles.selectCircle,
              isSelected && styles.selectCircleSelected,
            ]}
          >
            {isSelected && <Feather name="check" size={14} color={theme.colors.white} />}
          </View>
        )}
        {item.type === 'tag' ? (
          <View style={styles.tagIconWrap}>
            <Feather name="tag" size={18} color={theme.colors.primary} />
          </View>
        ) : (
          <Avatar uri={normFromUser(item)?.avatar_url ?? null} size={36} />
        )}
        <View style={styles.middle}>
          <Text style={styles.text} numberOfLines={2}>
            <Text style={styles.bold}>{bold}</Text>
            {rest}
          </Text>
          {isFriendRequest && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.acceptBtn, loading && styles.btnDisabled]}
                onPress={() => handleAcceptFriendRequest(item)}
                disabled={loading}
                activeOpacity={0.8}
                accessibilityLabel="Accept friend request"
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator size="small" color={theme.colors.textOnPrimary} />
                ) : (
                  <Text style={styles.acceptBtnText}>Accept</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.declineBtn, loading && styles.btnDisabled]}
                onPress={() => handleDeclineFriendRequest(item)}
                disabled={loading}
                activeOpacity={0.8}
                accessibilityLabel="Decline friend request"
                accessibilityRole="button"
              >
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
        {!isFriendRequest && normPost(item)?.image_url && (
          <SmoothImage
            source={{ uri: normPost(item)!.image_url }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        )}
      </>
    );

    if (selectMode) {
      return (
        <TouchableOpacity
          style={[styles.row, !item.read && styles.rowUnread]}
          onPress={() => handleNotificationPress(item)}
          onLongPress={() => handleLongPress(item.id)}
          delayLongPress={400}
          activeOpacity={0.7}
          accessibilityLabel={`${bold} ${rest}`}
          accessibilityRole="button"
        >
          {rowContent}
        </TouchableOpacity>
      );
    }

    // Friend request: one tappable row → sender profile; Accept/Decline stay separate (no post/thumbnail split)
    if (isFriendRequest) {
      return (
        <View style={[styles.row, styles.rowFriendRequest, !item.read && styles.rowUnread]}>
          <TouchableOpacity
            style={styles.friendRequestMain}
            onPress={() => handleNotificationPress(item)}
            activeOpacity={0.7}
            accessibilityLabel={`${bold} ${rest}`}
            accessibilityRole="button"
          >
            <Avatar uri={normFromUser(item)?.avatar_url ?? null} size={36} />
            <View style={styles.friendRequestTextCol}>
              <Text style={styles.text} numberOfLines={2}>
                <Text style={styles.bold}>{bold}</Text>
                {rest}
              </Text>
            </View>
            <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
          </TouchableOpacity>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.acceptBtn, loading && styles.btnDisabled]}
              onPress={() => handleAcceptFriendRequest(item)}
              disabled={loading}
              activeOpacity={0.8}
              accessibilityLabel="Accept friend request"
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator size="small" color={theme.colors.textOnPrimary} />
              ) : (
                <Text style={styles.acceptBtnText}>Accept</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.declineBtn, loading && styles.btnDisabled]}
              onPress={() => handleDeclineFriendRequest(item)}
              disabled={loading}
              activeOpacity={0.8}
              accessibilityLabel="Decline friend request"
              accessibilityRole="button"
            >
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Reaction / comment / tag: avatar + bold name → profile; action text + time + thumbnail → post
    const postThumb = normPost(item)?.image_url;
    return (
      <View style={[styles.row, !item.read && styles.rowUnread]}>
        <TouchableOpacity
          style={styles.senderBlock}
          onPress={() => handleSenderProfilePress(item)}
          activeOpacity={0.7}
          accessibilityLabel={`${bold} profile`}
          accessibilityRole="button"
        >
          {item.type === 'tag' ? (
            <View style={styles.tagIconWrap}>
              <Feather name="tag" size={18} color={theme.colors.primary} />
            </View>
          ) : (
            <Avatar uri={normFromUser(item)?.avatar_url ?? null} size={36} />
          )}
          <Text style={[styles.text, styles.bold, styles.senderName]} numberOfLines={1}>
            {bold}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.postTapArea}
          onPress={() => handleNotificationPress(item)}
          activeOpacity={0.7}
          accessibilityLabel={rest}
          accessibilityRole="button"
        >
          <Text style={[styles.text, styles.restLine]} numberOfLines={2}>
            {rest}
          </Text>
          <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
        </TouchableOpacity>
        {postThumb ? (
          <TouchableOpacity
            onPress={() => handleNotificationPress(item)}
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
        ) : null}
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
              <Skeleton width={36} height={36} borderRadius={18} />
              <View style={styles.skeletonRowContent}>
                <Skeleton width="80%" height={14} borderRadius={4} />
                <Skeleton width="50%" height={12} borderRadius={4} style={{ marginTop: 6 }} />
              </View>
              <Skeleton width={40} height={40} borderRadius={6} style={{ marginLeft: 8 }} />
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
          {selectMode && (
            <View style={styles.selectModeBar}>
              <TouchableOpacity
                onPress={() => {
                  setSelectMode(false);
                  setSelectedIds(new Set());
                }}
                activeOpacity={0.7}
                accessibilityLabel="Cancel selection"
                accessibilityRole="button"
              >
                <Text style={styles.selectModeCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.selectModeCount}>{selectedIds.size} selected</Text>
              <TouchableOpacity
                onPress={handleBulkDeleteNotifications}
                activeOpacity={0.7}
                accessibilityLabel="Delete selected notifications"
                accessibilityRole="button"
              >
                <Text style={styles.selectModeDelete}>
                  Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          )}
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
  tagIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  rowUnread: {
    backgroundColor: 'rgba(255, 122, 143, 0.08)',
  },
  senderBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    maxWidth: '38%',
  },
  senderName: {
    flexShrink: 1,
    minWidth: 0,
  },
  postTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: theme.spacing.sm,
    minWidth: 0,
    gap: 8,
  },
  restLine: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  rowFriendRequest: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  friendRequestMain: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  friendRequestTextCol: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    minWidth: 0,
  },
  middle: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    minWidth: 0,
  },
  text: {
    fontSize: 15,
    color: theme.colors.text,
  },
  bold: {
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginLeft: theme.spacing.sm,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginLeft: theme.spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  acceptBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  acceptBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textOnPrimary,
  },
  declineBtn: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  declineBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textTertiary,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  selectModeBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  selectModeCancel: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  selectModeCount: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  selectModeDelete: {
    fontSize: 16,
    color: '#FF3B30',
    fontWeight: '600',
  },
  selectCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  selectCircleSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
});
