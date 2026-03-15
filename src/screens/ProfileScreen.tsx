/**
 * ProfileScreen.tsx
 *
 * NOTE: This file is over 700 lines. Future refactoring candidates:
 * - Extract useProfilePosts hook (fetchMyPosts, loadMoreProfilePosts, merge tagged posts)
 * - Extract pickAndUploadAvatar utility (ImagePicker, blob conversion, storage upload, profile update)
 * - Extract ProfileSkeleton component (shared with FriendProfileScreen's skeleton)
 * - Extract ProfilePostGrid component (3-column grid with tag banners, shared with FriendProfileScreen)
 *
 * User's own profile - avatar, stats, recent posts grid, edit, logout.
 *
 * Key responsibilities:
 * - Avatar (tap to change), display name, username, posts/friends count
 * - 3x3 post grid with FlatList; tap opens CardStack, long-press delete
 * - Gear icon navigates to Settings
 * - Fetches own posts + posts where user is tagged (from friends)
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
  FlatList,
  ActionSheetIOS,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ProfileStackParamList } from '../navigation/types';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/AuthContext';
import { useCardStack } from '../lib/CardStackContext';
import { useFriends, usePosts } from '../hooks';
import { useToast } from '../lib/ToastContext';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import { requestCameraPermission, requestMediaLibraryPermission } from '../lib/permissions';
import type { PostWithProfile } from '../types';
import { CardStack } from '../components/CardStack';
import { Skeleton } from '../components/Skeleton';
import { Avatar } from '../components/Avatar';
import { SmoothImage } from '../components/SmoothImage';
const GRID_GAP = 2;

const profileSkeletonStyles = StyleSheet.create({
  profileSkeleton: { padding: 20, alignItems: 'center' },
  profileSkeletonStats: { flexDirection: 'row', marginTop: 20, gap: 40 },
  profileSkeletonStat: { alignItems: 'center' },
  profileSkeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 20,
    gap: 2,
    width: '100%',
  },
});

const ProfileSkeleton = React.memo(() => (
  <View style={profileSkeletonStyles.profileSkeleton}>
    <Skeleton width={80} height={80} borderRadius={40} />
    <Skeleton width={140} height={18} borderRadius={4} style={{ marginTop: 14 }} />
    <Skeleton width={100} height={14} borderRadius={4} style={{ marginTop: 8 }} />
    <View style={profileSkeletonStyles.profileSkeletonStats}>
      <View style={profileSkeletonStyles.profileSkeletonStat}>
        <Skeleton width={30} height={18} borderRadius={4} />
        <Skeleton width={40} height={12} borderRadius={4} style={{ marginTop: 4 }} />
      </View>
      <View style={profileSkeletonStyles.profileSkeletonStat}>
        <Skeleton width={30} height={18} borderRadius={4} />
        <Skeleton width={50} height={12} borderRadius={4} style={{ marginTop: 4 }} />
      </View>
    </View>
    <Skeleton width="90%" height={40} borderRadius={12} style={{ marginTop: 20 }} />
    <View style={profileSkeletonStyles.profileSkeletonGrid}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Skeleton key={i} width="32.5%" height={120} borderRadius={4} />
      ))}
    </View>
  </View>
));
ProfileSkeleton.displayName = 'ProfileSkeleton';

const GRID_CELL_SIZE_STATIC = (Dimensions.get('window').width - theme.screenPadding * 2 - GRID_GAP * 2) / 3;

/** Memoized thumbnail for profile grid - tap to open, long-press for action menu (own posts only) */
const GalleryThumbnail = React.memo(function GalleryThumbnail({
  post,
  userId,
  onPress,
  onLongPress,
  hasError,
  onError,
  cellSize,
}: {
  post: PostWithProfile;
  userId: string | undefined;
  onPress: () => void;
  onLongPress?: () => void;
  hasError: boolean;
  onError: () => void;
  cellSize: number;
}) {
  return (
    <TouchableOpacity
      style={[styles.gridCell, { width: cellSize, height: cellSize }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.7}
      accessibilityLabel="View post"
      accessibilityRole="button"
    >
      {hasError ? (
        <View style={[styles.gridCellEmpty, styles.gridImagePlaceholder]}>
          <Feather name="image" size={24} color={theme.colors.textTertiary} />
        </View>
      ) : (
        <>
          <SmoothImage
            source={{ uri: post.image_url }}
            style={styles.gridImage}
            resizeMode="cover"
            onError={onError}
          />
          {post.user_id !== userId && (
            <View style={styles.tagBanner}>
              <Text style={styles.tagBannerText} numberOfLines={1}>
                tagged by @{post.profiles?.username ?? 'deleted'}
              </Text>
            </View>
          )}
        </>
      )}
    </TouchableOpacity>
  );
});

export function ProfileScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const gridCellSize = (screenWidth - theme.screenPadding * 2 - GRID_GAP * 2) / 3;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList, 'Profile'>>();
  const { profile, session, refreshProfile } = useAuth();
  const { setCardStackOpen } = useCardStack();
  const { showToast } = useToast();
  const { removePost } = usePosts();
  const userId = profile?.id ?? session?.user?.id;
  const { friendIds, refresh: refreshFriends } = useFriends();
  const friendIdSet = useMemo(() => new Set(friendIds), [friendIds]);

  const PROFILE_PAGE_SIZE = 30;
  const [posts, setPosts] = useState<PostWithProfile[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [postsCount, setPostsCount] = useState(0);
  const [profileDataReady, setProfileDataReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<PostWithProfile[] | null>(null);
  const [selectedInitialIndex, setSelectedInitialIndex] = useState(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [gridImageErrors, setGridImageErrors] = useState<Record<string, boolean>>({});
  const hasInitiallyFetched = useRef(false);
  const profileFetchIdRef = useRef(0);

  const fetchMyPosts = useCallback(async (fetchId: number) => {
    if (!userId) return;

    const { data: ownData, error: ownError } = await supabase
      .from('posts')
      .select('id, image_url, caption, latitude, longitude, created_at, user_id, venue_name, category, reaction_count, comment_count, profiles:user_id(username, display_name, avatar_url), post_tags(tagged_user_id, profiles:tagged_user_id(display_name, username))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PROFILE_PAGE_SIZE);
    if (ownError) {
      if (__DEV__) console.error('Error fetching profile posts:', ownError);
      return;
    }
    const ownPosts = (ownData ?? []) as PostWithProfile[];

    const { data: taggedData } = await supabase
      .from('post_tags')
      .select('post_id, posts:post_id(id, image_url, caption, latitude, longitude, created_at, user_id, venue_name, category, reaction_count, comment_count, profiles:user_id(username, display_name, avatar_url), post_tags(tagged_user_id, profiles:tagged_user_id(display_name, username)))')
      .eq('tagged_user_id', userId)
      .limit(PROFILE_PAGE_SIZE);
    const taggedPosts = ((taggedData ?? []) as { post_id: string; posts: PostWithProfile }[])
      .map((t) => t.posts)
      .filter((p): p is PostWithProfile => !!p && friendIdSet.has(p.user_id));

    const merged = [...ownPosts];
    const ownIds = new Set(ownPosts.map((p) => p.id));
    for (const p of taggedPosts) {
      if (!ownIds.has(p.id)) {
        merged.push(p);
        ownIds.add(p.id);
      }
    }
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (fetchId !== profileFetchIdRef.current) return;
    setPosts(merged);
    setHasMore(ownPosts.length === PROFILE_PAGE_SIZE);
  }, [userId, friendIdSet]);

  const fetchPostsCount = useCallback(async (fetchId: number) => {
    if (!userId) return;
    const { count, error } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (fetchId !== profileFetchIdRef.current) return;
    if (!error) setPostsCount(count ?? 0);
  }, [userId]);

  const loadMoreProfilePosts = useCallback(async () => {
    if (loadingMore || !hasMore || !userId) return;
    setLoadingMore(true);
    try {
      const lastPost = posts[posts.length - 1];
      if (!lastPost) return;

      const { data, error } = await supabase
        .from('posts')
        .select('id, image_url, caption, latitude, longitude, created_at, user_id, venue_name, category, reaction_count, comment_count, profiles:user_id(username, display_name, avatar_url), post_tags(tagged_user_id, profiles:tagged_user_id(display_name, username))')
        .eq('user_id', userId)
        .lt('created_at', lastPost.created_at)
        .order('created_at', { ascending: false })
        .limit(PROFILE_PAGE_SIZE);

      if (error) {
        if (__DEV__) console.error('Error loading more profile posts:', error);
        return;
      }

      const newPosts = (data ?? []) as PostWithProfile[];
      setPosts((prev) => [...prev, ...newPosts]);
      setHasMore(newPosts.length === PROFILE_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [userId, posts, loadingMore, hasMore]);

  const friendsCount = friendIds.length;

  useFocusEffect(
    useCallback(() => {
      const fetchId = ++profileFetchIdRef.current;
      const isInitial = !hasInitiallyFetched.current;
      hasInitiallyFetched.current = true;
      let mounted = true;
      if (isInitial) setProfileDataReady(false);
      Promise.all([fetchMyPosts(fetchId), fetchPostsCount(fetchId)]).then(() => {
        if (mounted && fetchId === profileFetchIdRef.current) setProfileDataReady(true);
      });
      return () => { mounted = false; };
    }, [fetchMyPosts, fetchPostsCount])
  );

  async function handleRefresh() {
    setRefreshing(true);
    const fetchId = ++profileFetchIdRef.current;
    await Promise.all([fetchMyPosts(fetchId), fetchPostsCount(fetchId), refreshFriends()]);
    await refreshProfile();
    setRefreshing(false);
  }

  useEffect(() => {
    setCardStackOpen(selectedPosts !== null);
    return () => setCardStackOpen(false);
  }, [selectedPosts, setCardStackOpen]);

  async function pickAndUploadAvatar(getImage: () => Promise<ImagePicker.ImagePickerResult>) {
    const result = await getImage();
    if (result.canceled || !result.assets[0]) return;
    setUploadingAvatar(true);
    try {
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const filePath = `avatars/${userId}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(filePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl + '?t=' + Date.now();
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
      if (updateError) throw updateError;
      await refreshProfile();
    } catch (err) {
      if (__DEV__) console.error('Error uploading avatar:', err);
      Alert.alert('Error', 'Could not update profile photo. Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleChangeAvatar() {
    if (!userId || uploadingAvatar) return;
    Alert.alert(
      'Profile Photo',
      'Choose how to add a photo',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const hasPermission = await requestCameraPermission();
            if (!hasPermission) return;
            await pickAndUploadAvatar(() =>
              ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.7,
              })
            );
          },
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            const hasPermission = await requestMediaLibraryPermission();
            if (!hasPermission) return;
            await pickAndUploadAvatar(() =>
              ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.7,
              })
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  function handleFriendsPress() {
    navigation.navigate('Friends');
  }

  function handleViewAllPosts() {
    navigation.navigate('Gallery');
  }

  function handlePhotoPress(post: PostWithProfile) {
    const idx = posts.findIndex((p) => p.id === post.id);
    setSelectedInitialIndex(idx >= 0 ? idx : 0);
    setSelectedPosts(posts);
  }

  function showPostActionMenu(post: PostWithProfile) {
    if (post.user_id !== userId) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Edit Post', 'Delete Post', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            navigateToEditPost(post);
          } else if (buttonIndex === 1) {
            confirmDeletePost(post);
          }
        }
      );
    } else {
      Alert.alert('Post Options', '', [
        { text: 'Edit Post', onPress: () => navigateToEditPost(post) },
        { text: 'Delete Post', style: 'destructive', onPress: () => confirmDeletePost(post) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  function navigateToEditPost(post: PostWithProfile) {
    // Upload is inside Map tab's stack; get Tab navigator (parent of ProfileStack) and navigate to Map > Upload
    const tabNav = navigation.getParent() as { navigate: (name: string, params?: object) => void } | undefined;
    tabNav?.navigate('Map', {
      screen: 'Upload',
      params: {
        editMode: true,
        editPost: {
          id: post.id,
          image_url: post.image_url,
          caption: post.caption,
          venue_name: post.venue_name,
          category: post.category,
          latitude: post.latitude,
          longitude: post.longitude,
          post_tags: post.post_tags ?? [],
        },
      },
    });
  }

  function confirmDeletePost(post: PostWithProfile) {
    Alert.alert('Delete Post', "Are you sure? This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const imagePath = post.image_url.split('/posts/')[1]?.split('?')[0];
            if (imagePath) {
              const { error: storageErr } = await supabase.storage.from('posts').remove([imagePath]);
              if (storageErr) throw storageErr;
            }
            const { error } = await supabase.from('posts').delete().eq('id', post.id);
            if (error) throw error;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            removePost(post.id);
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
            setPostsCount((prev) => Math.max(0, prev - 1));
            setSelectedPosts((prev) => (prev ? prev.filter((p) => p.id !== post.id) : null));
          } catch (err) {
            if (__DEV__) console.error('Error deleting post:', err);
            Alert.alert('Error', 'Could not delete post. Please try again.');
          }
        },
      },
    ]);
  }

  const displayName = profile?.display_name ?? 'User';
  const username = profile?.username ?? 'username';
  const avatarUrl = profile?.avatar_url;
  const bottomPadding = insets.bottom + 100;
  const showProfileSkeletons = !profileDataReady && !!userId;
  const gridPosts = posts.slice(0, 9);

  const hasMorePosts = posts.length > 9;
  const GRID_SLOTS = 9;
  const gridSlots = Array.from({ length: GRID_SLOTS }, (_, i) => gridPosts[i] ?? null);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <TouchableOpacity
        onPress={() => navigation.navigate('Settings')}
        style={{
          position: 'absolute',
          top: insets.top + 12,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: theme.colors.surface,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10,
        }}
        activeOpacity={0.7}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        accessibilityLabel="Settings"
        accessibilityRole="button"
      >
        <Feather name="settings" size={20} color={theme.colors.text} />
      </TouchableOpacity>
      <ScrollView
        style={styles.scroll}
        scrollEnabled={selectedPosts === null}
        nestedScrollEnabled={true}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 20, paddingBottom: bottomPadding },
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
        {showProfileSkeletons ? (
          <ProfileSkeleton />
        ) : (
          <>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={handleChangeAvatar}
            disabled={uploadingAvatar}
            activeOpacity={0.8}
            accessibilityLabel="Change profile photo"
            accessibilityRole="button"
          >
            <View style={styles.avatarContainer}>
              <Avatar uri={avatarUrl ?? null} size={80} profilePlaceholder />
              {uploadingAvatar && (
                <View style={styles.avatarLoadingOverlay}>
                  <ActivityIndicator size="small" color={theme.colors.text} />
                </View>
              )}
            </View>
            <View style={styles.avatarBadge}>
              <Feather name="edit-2" size={12} color={theme.colors.textOnPrimary} />
            </View>
          </TouchableOpacity>

          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.username}>@{username}</Text>
          <View style={styles.statsRow}>
            <Text style={styles.statsNumber}>{postsCount}</Text>
            <Text style={styles.statsLabel}> posts  </Text>
            <Text style={styles.statsDivider}> |  </Text>
            <TouchableOpacity style={styles.statTouchable} onPress={handleFriendsPress} activeOpacity={0.7} accessibilityLabel={`${friendsCount} friends`} accessibilityRole="button">
              <Text style={[styles.statsNumber, styles.statsNumberTappable]}>{friendsCount}</Text>
              <Text style={[styles.statsLabel, styles.statsLabelTappable]}> friends</Text>
            </TouchableOpacity>
          </View>

        </View>

        <View style={styles.gallerySection}>
          <Text style={styles.galleryHeader}>Recent Posts</Text>
          {posts.length === 0 ? (
            <View style={styles.emptyGallery}>
              <Feather name="camera" size={40} color={theme.colors.textTertiary} />
              <Text style={styles.emptyGalleryText}>No posts yet</Text>
            </View>
          ) : (
            <FlatList
              data={gridSlots}
              numColumns={3}
              scrollEnabled={false}
              keyExtractor={(item, index) => (item ? item.id : `empty-${index}`)}
              renderItem={({ item: post, index }) =>
                post ? (
                  <GalleryThumbnail
                    post={post}
                    userId={userId}
                    onPress={() => handlePhotoPress(post)}
                    onLongPress={post.user_id === userId ? () => showPostActionMenu(post) : undefined}
                    hasError={!!gridImageErrors[post.id]}
                    onError={() => setGridImageErrors((prev) => ({ ...prev, [post.id]: true }))}
                    cellSize={gridCellSize}
                  />
                ) : (
                  <View style={[styles.gridCell, { width: gridCellSize, height: gridCellSize }, styles.gridCellEmpty]} />
                )
              }
              columnWrapperStyle={{ gap: GRID_GAP, marginBottom: GRID_GAP }}
              removeClippedSubviews={true}
              style={styles.grid}
            />
          )}
          {hasMorePosts && (
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={handleViewAllPosts}
              activeOpacity={0.6}
              accessibilityLabel="View all posts"
              accessibilityRole="button"
            >
              <Feather name="grid" size={16} color={theme.colors.primary} />
              <Text style={styles.viewAllText}>View All Posts</Text>
            </TouchableOpacity>
          )}
        </View>
          </>
        )}
      </ScrollView>

      {selectedPosts !== null && selectedPosts.length > 0 && (
        <CardStack
          posts={selectedPosts}
          onClose={() => setSelectedPosts(null)}
          initialIndex={selectedInitialIndex}
          onPostDeleted={(postId) => {
            removePost(postId);
            setPosts((prev) => prev.filter((p) => p.id !== postId));
            setPostsCount((prev) => Math.max(0, prev - 1));
            setSelectedPosts((prev) => (prev ? prev.filter((p) => p.id !== postId) : null));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: theme.spacing.lg },
  header: {
    alignItems: 'center',
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.screenPadding,
  },
  avatarWrapper: { position: 'relative', marginBottom: theme.spacing.sm },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlayMedium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  username: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: theme.spacing.lg,
  },
  statTouchable: { flexDirection: 'row', alignItems: 'baseline' },
  statsNumber: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },
  statsNumberTappable: { color: theme.colors.primary },
  statsLabel: { fontSize: theme.fontSize.xs, fontWeight: '400', color: theme.colors.textSecondary },
  statsLabelTappable: { color: theme.colors.primary },
  statsDivider: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginHorizontal: 4 },
  gallerySection: {
    paddingHorizontal: theme.screenPadding,
    marginBottom: theme.spacing.lg,
  },
  galleryHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: 'left',
  },
  grid: {
    backgroundColor: theme.colors.background,
  },
  gridCell: {
    width: GRID_CELL_SIZE_STATIC,
    height: GRID_CELL_SIZE_STATIC,
    overflow: 'hidden',
    borderRadius: 4,
    position: 'relative',
  },
  tagBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.overlayDark,
    paddingVertical: 4,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  tagBannerText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '500',
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
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  viewAllText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.primary,
  },
});
