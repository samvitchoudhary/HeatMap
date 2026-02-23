import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../lib/AuthContext';
import { useNotifications } from '../lib/NotificationContext';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import { Avatar } from '../components/Avatar';

function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

type FromUser = { display_name: string; username?: string; avatar_url: string | null } | null;
type PostInfo = { id: string; image_url: string; latitude: number; longitude: number } | null;

type NotificationWithRelations = {
  id: string;
  user_id: string;
  type: 'reaction' | 'comment' | 'friend_request';
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
  const { refreshUnreadCount } = useNotifications();
  const userId = session?.user?.id;

  const [notifications, setNotifications] = useState<NotificationWithRelations[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchNotifications = useCallback(
    async (showLoading = false) => {
      if (!userId) return;
      if (showLoading) setLoading(true);
      const { data, error } = await supabase
        .from('notifications')
        .select(
          '*, from_user:from_user_id(display_name, username, avatar_url), post:post_id(id, image_url, latitude, longitude)'
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching notifications:', error);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const list = (data ?? []) as NotificationWithRelations[];
      setNotifications(list);
      setLoading(false);
      setRefreshing(false);
      await refreshUnreadCount();
    },
    [userId, refreshUnreadCount]
  );

  useFocusEffect(
    useCallback(() => {
      const isFirstLoad = notifications === null;
      fetchNotifications(isFirstLoad);
    }, [fetchNotifications, notifications])
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      const timer = setTimeout(async () => {
        await supabase
          .from('notifications')
          .update({ read: true })
          .eq('user_id', userId)
          .eq('read', false);
        setNotifications((prev) => (prev ? prev.map((n) => ({ ...n, read: true })) : []));
        await refreshUnreadCount();
      }, 2000);
      return () => clearTimeout(timer);
    }, [userId, refreshUnreadCount])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotifications(false);
  }, [fetchNotifications]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
      setNotifications((prev) =>
        prev ? prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)) : []
      );
      await refreshUnreadCount();
    },
    [refreshUnreadCount]
  );

  const handleNotificationPress = useCallback(
    async (n: NotificationWithRelations) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await markAsRead(n.id);

      const rootNav = navigation.getParent() as any;

      if (n.type === 'reaction' || n.type === 'comment') {
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
    [navigation, markAsRead]
  );

  const handleAcceptFriendRequest = useCallback(
    async (n: NotificationWithRelations) => {
      if (!userId || n.type !== 'friend_request') return;
      setActionLoadingId(n.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const { data: friendship } = await supabase
        .from('friendships')
        .select('id')
        .eq('requester_id', n.from_user_id)
        .eq('addressee_id', userId)
        .eq('status', 'pending')
        .single();

      if (friendship) {
        await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendship.id);
      }
      await markAsRead(n.id);
      setNotifications((prev) => (prev ? prev.filter((x) => x.id !== n.id) : []));
      setActionLoadingId(null);
    },
    [userId, markAsRead]
  );

  const handleDeclineFriendRequest = useCallback(
    async (n: NotificationWithRelations) => {
      if (!userId || n.type !== 'friend_request') return;
      setActionLoadingId(n.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const { data: friendship } = await supabase
        .from('friendships')
        .select('id')
        .eq('requester_id', n.from_user_id)
        .eq('addressee_id', userId)
        .eq('status', 'pending')
        .single();

      if (friendship) {
        await supabase.from('friendships').update({ status: 'declined' }).eq('id', friendship.id);
      }
      await markAsRead(n.id);
      setNotifications((prev) => (prev ? prev.filter((x) => x.id !== n.id) : []));
      setActionLoadingId(null);
    },
    [userId, markAsRead]
  );

  const getNotificationText = (n: NotificationWithRelations) => {
    const from = normFromUser(n);
    const name = from?.display_name ?? 'Someone';
    if (n.type === 'reaction') {
      return { bold: name, rest: ` reacted ${n.emoji ?? '👍'} to your post` };
    }
    if (n.type === 'comment') {
      return { bold: name, rest: ' commented on your post' };
    }
    return { bold: name, rest: ' sent you a friend request' };
  };

  const renderItem = ({ item }: { item: NotificationWithRelations }) => {
    const { bold, rest } = getNotificationText(item);
    const isFriendRequest = item.type === 'friend_request';
    const loading = actionLoadingId === item.id;

    return (
      <TouchableOpacity
        style={[
          styles.row,
          !item.read && styles.rowUnread,
        ]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <Avatar uri={normFromUser(item)?.avatar_url ?? null} size={36} />
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
              >
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
        {!isFriendRequest && normPost(item)?.image_url && (
          <Image
            source={{ uri: normPost(item)!.image_url }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        )}
      </TouchableOpacity>
    );
  };

  if (!userId) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <Text style={styles.title}>Notifications</Text>

      {loading && notifications === null ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.colors.text} />
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
        <FlatList
          data={notifications ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.text}
            />
          }
        />
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
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
});
