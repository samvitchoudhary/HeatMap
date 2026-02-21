import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/AuthContext';
import { useCardStack } from '../lib/CardStackContext';
import { useToast } from '../lib/ToastContext';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import type { PostWithProfile } from '../types';
import { CardStack } from '../components/CardStack';
import { Skeleton } from '../components/Skeleton';
import { Avatar } from '../components/Avatar';

const GRID_GAP = 2;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_CELL_SIZE = (SCREEN_WIDTH - theme.screenPadding * 2 - GRID_GAP * 2) / 3;

type FriendshipStatus = 'friends' | 'pending_sent' | 'pending_received' | 'none';

type FriendProfileRouteParams = {
  userId: string;
};

export function FriendProfileScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const { userId: targetUserId } = (route.params ?? {}) as FriendProfileRouteParams;
  const { session } = useAuth();
  const { setCardStackOpen } = useCardStack();
  const { showToast } = useToast();
  const myUserId = session?.user?.id;

  const [profile, setProfile] = useState<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null>(null);
  const [posts, setPosts] = useState<PostWithProfile[]>([]);
  const [postsCount, setPostsCount] = useState(0);
  const [friendsCount, setFriendsCount] = useState(0);
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<PostWithProfile[] | null>(null);
  const [selectedInitialIndex, setSelectedInitialIndex] = useState(0);
  const [gridImageErrors, setGridImageErrors] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!targetUserId) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', targetUserId)
      .single();
    if (error || !data) {
      showToast('Could not load profile');
      return;
    }
    setProfile(data);
  }, [targetUserId, showToast]);

  const fetchPosts = useCallback(async () => {
    if (!targetUserId) return;
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles:user_id(username, display_name, avatar_url)')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching friend posts:', error);
      return;
    }
    setPosts((data ?? []) as PostWithProfile[]);
  }, [targetUserId]);

  const fetchPostsCount = useCallback(async () => {
    if (!targetUserId) return;
    const { count, error } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', targetUserId);
    if (!error) setPostsCount(count ?? 0);
  }, [targetUserId]);

  const fetchFriendsCount = useCallback(async () => {
    if (!targetUserId) return;
    const { count, error } = await supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`requester_id.eq.${targetUserId},addressee_id.eq.${targetUserId}`);
    if (!error) setFriendsCount(count ?? 0);
  }, [targetUserId]);

  const fetchFriendshipStatus = useCallback(async (): Promise<FriendshipStatus> => {
    if (!myUserId || !targetUserId || myUserId === targetUserId) return 'none';
    const { data: rows, error } = await supabase
      .from('friendships')
      .select('id, requester_id, addressee_id, status')
      .or(`requester_id.eq.${myUserId},addressee_id.eq.${myUserId}`);
    if (error) return 'none';
    const match = (rows ?? []).find(
      (r: { requester_id: string; addressee_id: string }) =>
        (r.requester_id === myUserId && r.addressee_id === targetUserId) ||
        (r.requester_id === targetUserId && r.addressee_id === myUserId)
    );
    if (!match) {
      setFriendshipStatus('none');
      setFriendshipId(null);
      return 'none';
    }
    setFriendshipId(match.id);
    const status: FriendshipStatus =
      match.status === 'accepted'
        ? 'friends'
        : match.requester_id === myUserId
          ? 'pending_sent'
          : 'pending_received';
    setFriendshipStatus(status);
    return status;
  }, [myUserId, targetUserId]);

  const loadAll = useCallback(async () => {
    await Promise.all([
      fetchProfile(),
      fetchFriendshipStatus(),
      fetchPostsCount(),
      fetchFriendsCount(),
    ]);
  }, [fetchProfile, fetchFriendshipStatus, fetchPostsCount, fetchFriendsCount]);

  useEffect(() => {
    if (!targetUserId) return;
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [targetUserId]);


  useEffect(() => {
    if (friendshipStatus === 'friends') {
      fetchPosts();
    } else {
      setPosts([]);
    }
  }, [friendshipStatus, targetUserId, fetchPosts]);

  useEffect(() => {
    setCardStackOpen(selectedPosts !== null);
    return () => setCardStackOpen(false);
  }, [selectedPosts, setCardStackOpen]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    const status = await fetchFriendshipStatus();
    if (status === 'friends') await fetchPosts();
    setRefreshing(false);
  }

  async function handleAddFriend() {
    if (!myUserId || !targetUserId || actionLoading) return;
    setActionLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await supabase.from('friendships').insert({
      requester_id: myUserId,
      addressee_id: targetUserId,
      status: 'pending',
    });
    setActionLoading(false);
    if (error) {
      showToast(error.message ?? 'Could not send request');
      return;
    }
    setFriendshipStatus('pending_sent');
  }

  async function handleAcceptRequest() {
    if (!friendshipId || actionLoading) return;
    setActionLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);
    setActionLoading(false);
    if (error) {
      showToast(error.message ?? 'Could not accept');
      return;
    }
    setFriendshipStatus('friends');
    await fetchPosts();
  }

  function handleRemoveFriend() {
    const name = profile?.display_name ?? profile?.username ?? 'this user';
    Alert.alert('Remove Friend', `Are you sure you want to remove ${name} as a friend?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (!friendshipId) return;
          const { error } = await supabase
            .from('friendships')
            .delete()
            .eq('id', friendshipId);
          if (error) {
            showToast(error.message ?? 'Could not remove friend');
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setFriendshipStatus('none');
          setFriendshipId(null);
          setPosts([]);
        },
      },
    ]);
  }

  function handleThreeDotsPress() {
    Alert.alert('Options', undefined, [
      {
        text: 'Remove Friend',
        style: 'destructive',
        onPress: handleRemoveFriend,
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function handlePhotoPress(post: PostWithProfile) {
    const idx = posts.findIndex((p) => p.id === post.id);
    setSelectedInitialIndex(idx >= 0 ? idx : 0);
    setSelectedPosts(posts);
  }

  const displayName = profile?.display_name ?? 'User';
  const username = profile?.username ?? 'username';
  const avatarUrl = profile?.avatar_url;
  const isFriend = friendshipStatus === 'friends';
  const canViewPosts = isFriend;
  const bottomPadding = insets.bottom + 100;
  const gridPosts = posts.slice(0, 9);
  const GRID_SLOTS = 9;
  const gridSlots = Array.from({ length: GRID_SLOTS }, (_, i) => gridPosts[i] ?? null);

  useEffect(() => {
    if (targetUserId && myUserId && targetUserId === myUserId) {
      navigation.goBack();
    }
  }, [targetUserId, myUserId, navigation]);

  if (!targetUserId) {
    return null;
  }

  if (targetUserId === myUserId) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          @{username}
        </Text>
        {isFriend ? (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleThreeDotsPress}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Feather name="more-horizontal" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.text}
          />
        }
      >
        <View style={styles.profileHeader}>
          {loading ? (
            <>
              <Skeleton width={80} height={80} borderRadius={40} style={{ marginBottom: theme.spacing.sm }} />
              <Skeleton width={160} height={22} borderRadius={8} style={{ marginBottom: 4 }} />
              <Skeleton width={100} height={15} borderRadius={6} style={{ marginBottom: theme.spacing.md }} />
              <View style={styles.statsRow}>
                <Skeleton width={24} height={16} borderRadius={4} />
                <Text style={styles.statsLabel}> posts  </Text>
                <Text style={styles.statsDivider}> |  </Text>
                <Skeleton width={24} height={16} borderRadius={4} />
                <Text style={styles.statsLabel}> friends</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.avatarContainer}>
                <Avatar uri={avatarUrl ?? null} size={80} profilePlaceholder />
              </View>
              <Text style={styles.displayName}>{displayName}</Text>
              <Text style={styles.username}>@{username}</Text>
              <View style={styles.statsRow}>
                <Text style={styles.statsNumber}>{postsCount}</Text>
                <Text style={styles.statsLabel}> posts  </Text>
                <Text style={styles.statsDivider}> |  </Text>
                <Text style={styles.statsNumber}>{friendsCount}</Text>
                <Text style={styles.statsLabel}> friends</Text>
              </View>

              {friendshipStatus === 'friends' && (
                <View style={[styles.friendshipBtn, styles.friendshipBtnFriends]}>
                  <Feather name="check" size={16} color={theme.colors.green} />
                  <Text style={[styles.friendshipBtnText, styles.friendshipBtnTextGreen]}>Friends ✓</Text>
                </View>
              )}
              {friendshipStatus === 'pending_sent' && (
                <View style={[styles.friendshipBtn, styles.friendshipBtnPending]}>
                  <Feather name="clock" size={16} color={theme.colors.textTertiary} />
                  <Text style={[styles.friendshipBtnText, styles.friendshipBtnTextTertiary]}>Requested</Text>
                </View>
              )}
              {friendshipStatus === 'pending_received' && (
                <TouchableOpacity
                  style={[styles.friendshipBtn, styles.friendshipBtnPrimary]}
                  onPress={handleAcceptRequest}
                  disabled={actionLoading}
                  activeOpacity={0.8}
                >
                  <Feather name="user-check" size={16} color={theme.colors.textOnPrimary} />
                  <Text style={[styles.friendshipBtnText, styles.friendshipBtnTextWhite]}>Accept Request</Text>
                </TouchableOpacity>
              )}
              {friendshipStatus === 'none' && (
                <TouchableOpacity
                  style={[styles.friendshipBtn, styles.friendshipBtnPrimary]}
                  onPress={handleAddFriend}
                  disabled={actionLoading}
                  activeOpacity={0.8}
                >
                  <Feather name="user-plus" size={16} color={theme.colors.textOnPrimary} />
                  <Text style={[styles.friendshipBtnText, styles.friendshipBtnTextWhite]}>Add Friend</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        <View style={styles.gallerySection}>
          <Text style={styles.galleryHeader}>Posts</Text>
          {!canViewPosts ? (
            <View style={styles.emptyGallery}>
              <Feather name="image" size={40} color={theme.colors.textTertiary} />
              <Text style={styles.emptyGalleryText}>
                Add {displayName} as a friend to see their posts
              </Text>
            </View>
          ) : posts.length === 0 ? (
            <View style={styles.emptyGallery}>
              <Feather name="camera" size={40} color={theme.colors.textTertiary} />
              <Text style={styles.emptyGalleryText}>No posts yet</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {gridSlots.map((post, i) =>
                post ? (
                  <TouchableOpacity
                    key={post.id}
                    style={styles.gridCell}
                    onPress={() => handlePhotoPress(post)}
                    activeOpacity={0.7}
                  >
                    {gridImageErrors[post.id] ? (
                      <View style={[styles.gridCellEmpty, styles.gridImagePlaceholder]}>
                        <Feather name="image" size={24} color={theme.colors.textTertiary} />
                      </View>
                    ) : (
                      <Image
                        source={{ uri: post.image_url }}
                        style={styles.gridImage}
                        resizeMode="cover"
                        onError={() => setGridImageErrors((prev) => ({ ...prev, [post.id]: true }))}
                      />
                    )}
                  </TouchableOpacity>
                ) : (
                  <View key={`empty-${i}`} style={[styles.gridCell, styles.gridCellEmpty]} />
                )
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {selectedPosts !== null && selectedPosts.length > 0 && (
        <CardStack
          posts={selectedPosts}
          onClose={() => setSelectedPosts(null)}
          initialIndex={selectedInitialIndex}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.screenPadding,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 40 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: theme.spacing.lg },
  profileHeader: {
    alignItems: 'center',
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.screenPadding,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  username: {
    fontSize: 15,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: theme.spacing.md,
  },
  statsNumber: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },
  statsLabel: { fontSize: theme.fontSize.xs, fontWeight: '400', color: theme.colors.textSecondary },
  statsDivider: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginHorizontal: 4,
  },
  friendshipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: theme.button.secondaryHeight,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.button.borderRadius,
  },
  friendshipBtnFriends: {
    backgroundColor: theme.colors.surface,
  },
  friendshipBtnPending: {
    backgroundColor: theme.colors.surface,
  },
  friendshipBtnPrimary: {
    backgroundColor: theme.colors.primary,
    ...theme.shadows.button,
  },
  friendshipBtnText: { fontSize: 16, fontWeight: '600' },
  friendshipBtnTextGreen: { color: theme.colors.green },
  friendshipBtnTextTertiary: { color: theme.colors.textTertiary },
  friendshipBtnTextWhite: { color: theme.colors.textOnPrimary },
  gallerySection: {
    paddingHorizontal: theme.screenPadding,
    marginTop: theme.spacing.lg,
  },
  galleryHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: 'left',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    backgroundColor: theme.colors.background,
  },
  gridCell: {
    width: GRID_CELL_SIZE,
    height: GRID_CELL_SIZE,
    overflow: 'hidden',
    borderRadius: 4,
  },
  gridCellEmpty: {
    backgroundColor: theme.colors.surfaceLight,
  },
  gridImagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  emptyGallery: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  emptyGalleryText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
});
