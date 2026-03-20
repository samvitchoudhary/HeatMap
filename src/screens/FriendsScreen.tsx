/**
 * FriendsScreen.tsx
 *
 * Friends list and incoming friend requests.
 *
 * Key responsibilities:
 * - Lists accepted friends with avatars; tap navigates to FriendProfileScreen
 * - Shows pending incoming requests with Accept / Decline
 * - Use the Search tab to find new users
 */

import React, { useState, useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ProfileStackParamList, RootStackNavigationProp } from '../navigation/types';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/AuthContext';
import { useFriends } from '../hooks';
import { fetchAllFriendships } from '../services/friendships.service';
import { theme } from '../lib/theme';
import type { Profile, Friendship } from '../types';
import { Skeleton } from '../components/Skeleton';
import { Avatar } from '../components/Avatar';
import { useFriendshipActions } from '../hooks/useFriendshipActions';

type FriendshipWithProfile = Friendship & {
  other_user: Profile;
};

type FriendsScreenNav = NativeStackNavigationProp<ProfileStackParamList, 'Friends'>;

function getRequesterFromRow(f: Friendship & { requester?: Profile | Profile[] }): Profile | null {
  const r = f.requester as Profile | Profile[] | undefined;
  if (!r) return null;
  return Array.isArray(r) ? r[0] ?? null : r;
}

export function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<FriendsScreenNav>();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { friends: friendsFromContext, loading: friendsLoading, refresh: refreshFriends } = useFriends();
  const [refreshing, setRefreshing] = useState(false);

  const [friendships, setFriendships] = useState<Friendship[]>([]);

  const { acceptRequest, declineRequest } = useFriendshipActions();

  const fetchFriendships = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await fetchAllFriendships(userId, 500);
    if (error) {
      __DEV__ && console.error('Error fetching friendships:', error);
      return;
    }
    setFriendships((data ?? []) as Friendship[]);
  }, [userId]);

  const pendingIncoming = React.useMemo(() => {
    if (!userId) return [];
    return friendships.filter((f) => f.status === 'pending' && f.addressee_id === userId);
  }, [friendships, userId]);

  const friends: FriendshipWithProfile[] = React.useMemo(() => {
    return friendsFromContext.map((f) => ({
      id: f.id,
      requester_id: userId ?? '',
      addressee_id: f.id,
      status: 'accepted' as const,
      created_at: '',
      other_user: {
        id: f.id,
        username: f.username,
        display_name: f.display_name,
        avatar_url: f.avatar_url,
        created_at: '',
      },
    }));
  }, [friendsFromContext, userId]);

  useFocusEffect(
    useCallback(() => {
      fetchFriendships();
      refreshFriends();
    }, [fetchFriendships, refreshFriends])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refreshFriends(), fetchFriendships()]);
    setRefreshing(false);
  }

  const handleAccept = useCallback(
    async (friendshipId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const ok = await acceptRequest(friendshipId);
      if (ok) {
        await Promise.all([fetchFriendships(), refreshFriends()]);
      }
    },
    [acceptRequest, fetchFriendships, refreshFriends]
  );

  const handleDecline = useCallback(
    async (friendshipId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const ok = await declineRequest(friendshipId);
      if (ok) {
        await fetchFriendships();
      }
    },
    [declineRequest, fetchFriendships]
  );

  const openFriendProfile = useCallback((id: string) => {
    (
      navigation.getParent()?.getParent?.()?.getParent?.() as RootStackNavigationProp | undefined
    )?.navigate('FriendProfile', { userId: id });
  }, [navigation]);

  const ListHeader = React.useMemo(() => {
    if (pendingIncoming.length === 0) return null;
    return (
      <View style={styles.requestsSection}>
        <Text style={styles.sectionTitle}>Friend requests</Text>
        {pendingIncoming.map((row) => {
          const req = getRequesterFromRow(row as Friendship & { requester?: Profile | Profile[] });
          if (!req) return null;
          return (
            <View key={row.id} style={styles.requestRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.requestMain,
                  pressed && { backgroundColor: theme.colors.surfaceLight },
                ]}
                onPress={() => openFriendProfile(req.id)}
                accessibilityLabel={`${req.display_name}'s profile`}
                accessibilityRole="button"
              >
                <Avatar uri={req.avatar_url ?? null} size={40} />
                <View style={styles.requestText}>
                  <Text style={styles.displayName}>{req.display_name || 'No name'}</Text>
                  <Text style={styles.username}>@{req.username}</Text>
                </View>
              </Pressable>
              <View style={styles.requestActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.acceptBtn]}
                  onPress={() => handleAccept(row.id)}
                  activeOpacity={0.8}
                  accessibilityLabel="Accept friend request"
                  accessibilityRole="button"
                >
                  <Feather name="user-check" size={16} color={theme.colors.textOnPrimary} />
                  <Text style={styles.actionBtnTextLight}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.declineBtn]}
                  onPress={() => handleDecline(row.id)}
                  activeOpacity={0.8}
                  accessibilityLabel="Decline friend request"
                  accessibilityRole="button"
                >
                  <Text style={styles.actionBtnTextMuted}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    );
  }, [pendingIncoming, openFriendProfile, handleAccept, handleDecline]);

  if (!userId) return null;

  const bottom = insets.bottom;

  const emptyNoFriends = !friendsLoading && friends.length === 0 && pendingIncoming.length === 0;

  return (
    <View style={[styles.container, { paddingTop: theme.spacing.md, backgroundColor: theme.colors.background }]}>
      {friendsLoading ? (
        <View style={styles.listContent}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <View key={i} style={styles.friendSkeletonRow}>
              <Skeleton width={44} height={44} borderRadius={22} />
              <View style={styles.skeletonTextBlock}>
                <Skeleton width={130} height={14} borderRadius={4} />
                <Skeleton width={90} height={12} borderRadius={4} style={{ marginTop: 6 }} />
              </View>
            </View>
          ))}
        </View>
      ) : emptyNoFriends ? (
        <View style={styles.emptyCenter}>
          <Feather name="users" size={40} color={theme.colors.textTertiary} />
          <Text style={styles.emptyTitle}>No friends yet</Text>
          <Text style={styles.emptySubtitle}>Use the Search tab to find people and send requests</Text>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottom + theme.spacing.xl }]}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          bounces={true}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          removeClippedSubviews={true}
          windowSize={5}
          maxToRenderPerBatch={10}
          initialNumToRender={10}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.text} />
          }
          ListEmptyComponent={
            pendingIncoming.length > 0 ? (
              <Text style={styles.noFriendsYetInline}>No friends yet — accept requests above or use Search.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.friendRow, pressed && { backgroundColor: theme.colors.surfaceLight }]}
              onPress={() => openFriendProfile(item.other_user?.id ?? '')}
              accessibilityLabel={item.other_user?.display_name ?? 'Friend'}
              accessibilityRole="button"
            >
              <View style={styles.avatarWrap}>
                <Avatar uri={item.other_user?.avatar_url ?? null} size={40} />
              </View>
              <View style={styles.searchInfo}>
                <Text style={styles.displayName}>{item.other_user?.display_name || 'No name'}</Text>
                <Text style={styles.username}>@{item.other_user?.username ?? 'unknown'}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  requestsSection: {
    paddingHorizontal: theme.screenPadding,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  requestRow: {
    marginBottom: theme.spacing.md,
  },
  requestMain: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: theme.borderRadius.md,
  },
  requestText: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginLeft: 52,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    minHeight: 36,
    borderRadius: 14,
  },
  acceptBtn: {
    backgroundColor: theme.colors.green,
  },
  declineBtn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionBtnTextLight: {
    marginLeft: 6,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textOnPrimary,
  },
  actionBtnTextMuted: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  noFriendsYetInline: {
    paddingHorizontal: theme.screenPadding,
    paddingTop: theme.spacing.md,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
    textAlign: 'center',
  },
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  emptySubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  friendSkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  skeletonTextBlock: {
    marginLeft: 12,
    flex: 1,
  },
  listContent: {
    padding: theme.screenPadding,
    paddingBottom: theme.spacing.lg,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.listRowGap,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  avatarWrap: {
    marginRight: theme.spacing.md,
  },
  searchInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
  },
  username: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
});
