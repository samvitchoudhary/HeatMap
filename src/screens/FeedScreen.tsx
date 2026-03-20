/**
 * FeedScreen.tsx
 *
 * Activity feed - posts from friends.
 *
 * Key responsibilities:
 * - FlatList of FeedCards; fetches posts from friends (friendships + posts)
 * - Pagination (load more on scroll), pull-to-refresh
 * - Reactions and comments fetched per batch; FeedBadge integration (markFeedSeen)
 * - Delete post with fade animation; expand photo, navigate to venue/profile
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { MaterialTopTabNavigationProp } from '@react-navigation/material-top-tabs';
import type { MainTabParamList, RootStackNavigationProp } from '../navigation/types';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/AuthContext';
import { useFeedBadge } from '../lib/FeedBadgeContext';
import { useFriends, usePosts } from '../hooks';
import { theme } from '../lib/theme';
import type { PostWithProfile } from '../types';
import { FeedCard, type FeedLatestComment } from '../components/FeedCard';
import { PhotoViewer } from '../components/PhotoViewer';
import { Skeleton } from '../components/Skeleton';
import { useFeed } from '../hooks/useFeed';
import { deletePost, deletePostImage } from '../services/posts.service';

/** Feed post with user's reaction emoji and per-emoji counts for the ReactionBar */
export type FeedPost = PostWithProfile & {
  reaction_counts: Record<string, number>;
  user_reaction: string | null;
};

type FeedScreenNav = MaterialTopTabNavigationProp<MainTabParamList>;

const FeedSkeleton = React.memo(() => (
  <View style={feedSkeletonStyles.skeletonFeed}>
    {[1, 2, 3].map((i) => (
      <View key={i} style={feedSkeletonStyles.skeletonCard}>
        <Skeleton width="100%" height={300} borderRadius={0} />
        <View style={feedSkeletonStyles.skeletonInfo}>
          <View style={feedSkeletonStyles.skeletonHeader}>
            <Skeleton width={36} height={36} borderRadius={18} />
            <View style={feedSkeletonStyles.skeletonHeaderText}>
              <Skeleton width={120} height={14} borderRadius={4} />
              <Skeleton width={80} height={12} borderRadius={4} style={{ marginTop: 6 }} />
            </View>
          </View>
          <Skeleton width="70%" height={12} borderRadius={4} style={{ marginTop: 4 }} />
        </View>
        <View style={feedSkeletonStyles.skeletonReactions}>
          {[1, 2, 3, 4, 5, 6].map((j) => (
            <Skeleton key={j} width={28} height={28} borderRadius={14} style={{ marginRight: 12 }} />
          ))}
        </View>
      </View>
    ))}
  </View>
));
FeedSkeleton.displayName = 'FeedSkeleton';

const feedSkeletonStyles = StyleSheet.create({
  skeletonFeed: { padding: 16 },
  skeletonCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  skeletonInfo: { padding: 14 },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center' },
  skeletonHeaderText: { marginLeft: 10 },
  skeletonReactions: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
});

export function FeedScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<FeedScreenNav>();
  const { profile } = useAuth();
  const { friendIds } = useFriends();
  const { removePost } = usePosts();
  const { markFeedSeen, lastSeenAt } = useFeedBadge();
  const [refreshing, setRefreshing] = useState(false);
  const [fadingOutId, setFadingOutId] = useState<string | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  /** Post IDs removed locally after delete animation (useFeed list is refetched on next focus/refresh). */
  const [removedPostIds, setRemovedPostIds] = useState<Set<string>>(() => new Set());
  const hasInitiallyFetched = useRef(false);
  const {
    displayPosts,
    feedPosts,
    loading,
    loadingMore,
    hasMore,
    fetchFeed,
    loadMore,
    forceSort,
  } = useFeed(profile?.id, friendIds);

  const visiblePosts = useMemo(
    () => displayPosts.filter((p) => !removedPostIds.has(p.id)),
    [displayPosts, removedPostIds]
  );

  /** Estimated card height for FlatList getItemLayout - improves scroll perf */
  const FEED_CARD_HEIGHT = useMemo(() => {
    const cardWidth = width - 40;
    const photoHeight = cardWidth * (5 / 4);
    const infoHeight = 110;
    const barHeight = 50;
    const margins = 20;
    return photoHeight + infoHeight + barHeight + margins;
  }, [width]);

  // sorting and fetching now handled by useFeed

  useFocusEffect(
    useCallback(() => {
      return () => {
        markFeedSeen();
      };
    }, [markFeedSeen])
  );

  useFocusEffect(
    useCallback(() => {
      const isInitial = !hasInitiallyFetched.current;
      hasInitiallyFetched.current = true;
      fetchFeed(false);
      forceSort();
      return;
    }, [fetchFeed, forceSort])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await fetchFeed(false);
    setRemovedPostIds(new Set());
    forceSort();
    setRefreshing(false);
  }

  const handleDeletePost = useCallback(
    async (post: PostWithProfile) => {
      try {
        await deletePostImage(post.image_url);
        const { error } = await deletePost(post.id);
        if (error) throw error;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setFadingOutId(post.id);
      } catch (err) {
        if (__DEV__) console.error('Error deleting post:', err);
        Alert.alert('Error', 'Could not delete post. Please try again.');
      }
    },
    []
  );

  const handleFadeComplete = useCallback((postId: string) => {
    removePost(postId);
    setRemovedPostIds((prev) => new Set(prev).add(postId));
    setFadingOutId(null);
  }, [removePost]);

  const handleReactionChange = useCallback(
    (_postId: string, _counts: Record<string, number>, _userReaction: string | null) => {},
    []
  );

  const handleCommentPosted = useCallback(
    (_postId: string, _count: number, _latestComment: FeedLatestComment | null) => {},
    []
  );

  const handleVenuePress = useCallback(
    (latitude: number, longitude: number) => {
      navigation.navigate('Map', { latitude, longitude });
    },
    [navigation]
  );

  const handleProfilePress = useCallback(
    (userId: string) => {
      (navigation.getParent()?.getParent?.() as RootStackNavigationProp | undefined)?.navigate(
        'FriendProfile',
        { userId }
      );
    },
    [navigation]
  );

  function handleEndReached() {
    if (loadingMore || !hasMore || loading || displayPosts.length === 0) return;
    loadMore();
  }

  const emptyComponent =
    visiblePosts.length === 0 && !loading ? (
      <View style={styles.emptyState}>
        <Feather name="activity" size={48} color={theme.colors.textTertiary} />
        <Text style={styles.emptyTitle}>No activity yet</Text>
        <Text style={styles.emptySubtitle}>
          Add friends to see their posts here
        </Text>
      </View>
    ) : null;

  if (!profile?.id) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      {expandedPhoto && (
        <PhotoViewer
          imageUrl={expandedPhoto}
          onClose={() => setExpandedPhoto(null)}
        />
      )}
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.headerTitle}>Activity</Text>
      </View>

      {loading && displayPosts.length === 0 ? (
        <View style={[styles.skeletonWrap, { paddingBottom: insets.bottom + 100 }]}>
          <FeedSkeleton />
        </View>
      ) : (
        <FlatList
          data={visiblePosts}
          keyExtractor={(item) => item.id}
          getItemLayout={(_, index) => ({
            length: FEED_CARD_HEIGHT,
            offset: FEED_CARD_HEIGHT * index,
            index,
          })}
          windowSize={5}
          maxToRenderPerBatch={5}
          initialNumToRender={3}
          removeClippedSubviews={true}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => (
            <FeedCard
              post={item}
              isNew={
                !!lastSeenAt &&
                item.user_id !== profile?.id &&
                new Date(item.created_at) > new Date(lastSeenAt)
              }
              onReactionChange={handleReactionChange}
              onCommentPosted={handleCommentPosted}
              onVenuePress={handleVenuePress}
              onProfilePress={handleProfilePress}
              onDeletePost={handleDeletePost}
              onExpandPhoto={setExpandedPhoto}
              isFadingOut={fadingOutId === item.id}
              onFadeComplete={handleFadeComplete}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          bounces={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.text}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerSpinner}>
                <ActivityIndicator size="small" color={theme.colors.text} />
              </View>
            ) : null
          }
          ListEmptyComponent={emptyComponent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: theme.spacing.md,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'left',
  },
  listContent: {
    paddingTop: theme.spacing.sm,
  },
  skeletonWrap: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.screenPadding,
  },
  emptyTitle: {
    fontSize: 18,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    textAlign: 'center',
  },
  footerSpinner: {
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
});
