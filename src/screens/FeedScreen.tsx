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
  Dimensions,
  Alert,
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
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import type { PostWithProfile } from '../types';
import { FeedCard, type FeedLatestComment } from '../components/FeedCard';
import { PhotoViewer } from '../components/PhotoViewer';
import { Skeleton } from '../components/Skeleton';

export type FeedReactionCounts = Record<string, Record<string, number>>;
export type FeedUserReactions = Record<string, string | null>;
export type FeedCommentCounts = Record<string, number>;

type FeedScreenNav = MaterialTopTabNavigationProp<MainTabParamList>;

/**
 * Scores a post for feed ranking.
 * Combines recency with engagement (reactions + comments).
 * Recent posts with more engagement appear higher.
 *
 * Score = recencyScore + engagementBonus
 * - recencyScore: 1.0 for posts from last hour, decays over 48 hours
 * - engagementBonus: 0.1 per reaction/comment, capped at 0.5
 */
function scoreFeedPost(
  post: PostWithProfile,
  reactionCount: number,
  commentCount: number
): number {
  const ageMs = Date.now() - new Date(post.created_at).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  // Recency: 1.0 for brand new, approaches 0 after 48 hours
  const recencyScore = Math.max(0, 1 - ageHours / 48);

  // Engagement: small bonus for reactions and comments
  const engagementBonus = Math.min(0.5, (reactionCount + commentCount) * 0.1);

  return recencyScore + engagementBonus;
}

export function FeedScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<FeedScreenNav>();
  const { profile } = useAuth();
  const { friendIds } = useFriends();
  const { removePost } = usePosts();
  const { markFeedSeen, lastSeenAt } = useFeedBadge();
  const [posts, setPosts] = useState<PostWithProfile[]>([]);
  const [reactionsByPostId, setReactionsByPostId] = useState<FeedReactionCounts>({});
  const [userReactionsByPostId, setUserReactionsByPostId] = useState<FeedUserReactions>({});
  const [commentCountByPostId, setCommentCountByPostId] = useState<FeedCommentCounts>({});
  const [latestCommentByPostId, setLatestCommentByPostId] = useState<Record<string, FeedLatestComment | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [fadingOutId, setFadingOutId] = useState<string | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const hasInitiallyFetched = useRef(false);
  const feedFetchIdRef = useRef(0);

  const PAGE_SIZE = 20;

  /** Estimated card height for FlatList getItemLayout - improves scroll perf */
  const FEED_CARD_HEIGHT = useMemo(() => {
    const { width } = Dimensions.get('window');
    const cardWidth = width - 40;
    const photoHeight = cardWidth * (5 / 4);
    const infoHeight = 110;
    const barHeight = 50;
    const margins = 20;
    return photoHeight + infoHeight + barHeight + margins;
  }, []);

  const FeedSkeleton = () => (
    <View style={styles.skeletonFeed}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <Skeleton width="100%" height={300} borderRadius={0} />
          <View style={styles.skeletonInfo}>
            <View style={styles.skeletonHeader}>
              <Skeleton width={36} height={36} borderRadius={18} />
              <View style={styles.skeletonHeaderText}>
                <Skeleton width={120} height={14} borderRadius={4} />
                <Skeleton width={80} height={12} borderRadius={4} style={{ marginTop: 6 }} />
              </View>
            </View>
            <Skeleton width="70%" height={12} borderRadius={4} style={{ marginTop: 4 }} />
          </View>
          <View style={styles.skeletonReactions}>
            {[1, 2, 3, 4, 5, 6].map((j) => (
              <Skeleton key={j} width={28} height={28} borderRadius={14} style={{ marginRight: 12 }} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );

  const fetchPage = useCallback(
    async (offset: number, append: boolean, silent = false) => {
      const fetchId = ++feedFetchIdRef.current;
      const userId = profile?.id;
      if (!userId) {
        setLoading(false);
        return;
      }
      const hasData = posts.length > 0 || append;
      if (!silent) {
        if (offset === 0 && !hasData) {
          setLoading(true);
        } else if (offset > 0) {
          setLoadingMore(true);
        }
      }

      if (friendIds.length === 0) {
        if (fetchId !== feedFetchIdRef.current) return;
        setPosts([]);
        setHasMore(false);
        setReactionsByPostId({});
        setUserReactionsByPostId({});
        setCommentCountByPostId({});
        setLatestCommentByPostId({});
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      try {
      const { data: postsData, error } = await supabase
        .from('posts')
        .select('*, profiles:user_id(username, display_name, avatar_url), post_tags(tagged_user_id, profiles:tagged_user_id(display_name, username))')
        .neq('user_id', userId)
        .in('user_id', friendIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;

      if (fetchId !== feedFetchIdRef.current) return;

      const postsList = (postsData ?? []) as PostWithProfile[];
      setHasMore(postsList.length === PAGE_SIZE);

      if (append) {
        setPosts((prev) => [...prev, ...postsList]);
      } else {
        setPosts(postsList);
      }

      const postIds = postsList.map((p) => p.id);
      if (postIds.length === 0) {
        if (fetchId !== feedFetchIdRef.current) return;
        if (!append) {
          setReactionsByPostId({});
          setUserReactionsByPostId({});
          setCommentCountByPostId({});
          setLatestCommentByPostId({});
        }
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const { data: reactions } = await supabase
        .from('reactions')
        .select('post_id, emoji, user_id')
        .in('post_id', postIds)
        .limit(500);

      const { data: comments } = await supabase
        .from('comments')
        .select('id, post_id, content, profiles:user_id(display_name, username)')
        .in('post_id', postIds)
        .order('created_at', { ascending: false })
        .limit(200);

      const countsByPost: Record<string, Record<string, number>> = {};
      const userReactionsByPost: Record<string, string | null> = {};
      for (const row of reactions ?? []) {
        const pid = row.post_id as string;
        const emoji = row.emoji as string;
        if (!countsByPost[pid]) countsByPost[pid] = {};
        countsByPost[pid][emoji] = (countsByPost[pid][emoji] ?? 0) + 1;
        if (row.user_id === userId) {
          userReactionsByPost[pid] = emoji;
        }
      }

      const commentCountByPost: Record<string, number> = {};
      const latestByPost: Record<string, FeedLatestComment | null> = {};
      const seenPostIds = new Set<string>();
      for (const c of comments ?? []) {
        const pid = c.post_id as string;
        commentCountByPost[pid] = (commentCountByPost[pid] ?? 0) + 1;
        if (!seenPostIds.has(pid)) {
          seenPostIds.add(pid);
          latestByPost[pid] = {
            id: c.id,
            content: c.content,
            profiles: (c as { profiles?: { display_name: string } | null }).profiles ?? null,
          };
        }
      }

      if (fetchId !== feedFetchIdRef.current) return;

      if (append) {
        setReactionsByPostId((prev) => ({ ...prev, ...countsByPost }));
        setUserReactionsByPostId((prev) => ({ ...prev, ...userReactionsByPost }));
        setCommentCountByPostId((prev) => ({ ...prev, ...commentCountByPost }));
        setLatestCommentByPostId((prev) => ({ ...prev, ...latestByPost }));
      } else {
        setReactionsByPostId(countsByPost);
        setUserReactionsByPostId(userReactionsByPost);
        setCommentCountByPostId(commentCountByPost);
        setLatestCommentByPostId(latestByPost);
      }

      } catch (err) {
        if (__DEV__) console.error('Failed to fetch feed:', err);
      } finally {
        if (fetchId === feedFetchIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [profile?.id, friendIds]
  );

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
      if (isInitial) {
        fetchPage(0, false);
      } else {
        fetchPage(0, false, true);
      }
    }, [fetchPage])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await fetchPage(0, false, true);
    setRefreshing(false);
  }

  const handleDeletePost = useCallback(
    async (post: PostWithProfile) => {
      try {
        const imagePath = post.image_url.split('/posts/')[1]?.split('?')[0];
        if (imagePath) {
          const { error: storageErr } = await supabase.storage.from('posts').remove([imagePath]);
          if (storageErr) throw storageErr;
        }
        const { error } = await supabase.from('posts').delete().eq('id', post.id);
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
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setFadingOutId(null);
  }, [removePost]);

  const handleReactionChange = useCallback(
    (postId: string, counts: Record<string, number>, userReaction: string | null) => {
      setReactionsByPostId((prev) => ({ ...prev, [postId]: counts }));
      setUserReactionsByPostId((prev) => ({ ...prev, [postId]: userReaction }));
    },
    []
  );

  const handleCommentPosted = useCallback(
    (postId: string, count: number, latestComment: FeedLatestComment | null) => {
      setCommentCountByPostId((prev) => ({ ...prev, [postId]: count }));
      setLatestCommentByPostId((prev) => ({ ...prev, [postId]: latestComment }));
    },
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
    if (loadingMore || !hasMore || loading || posts.length === 0) return;
    fetchPage(posts.length, true);
  }

  const sortedPosts = useMemo(() => {
    return [...posts].sort((a, b) => {
      const reactionCountA = Object.values(reactionsByPostId[a.id] ?? {}).reduce((s, c) => s + c, 0);
      const commentCountA = commentCountByPostId[a.id] ?? 0;
      const reactionCountB = Object.values(reactionsByPostId[b.id] ?? {}).reduce((s, c) => s + c, 0);
      const commentCountB = commentCountByPostId[b.id] ?? 0;
      return (
        scoreFeedPost(b, reactionCountB, commentCountB) -
        scoreFeedPost(a, reactionCountA, commentCountA)
      );
    });
  }, [posts, reactionsByPostId, commentCountByPostId]);

  const emptyComponent =
    posts.length === 0 && !loading ? (
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

      {loading && posts.length === 0 ? (
        <View style={[styles.skeletonWrap, { paddingBottom: insets.bottom + 100 }]}>
          <FeedSkeleton />
        </View>
      ) : (
        <FlatList
          data={sortedPosts}
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
              reactionCounts={reactionsByPostId[item.id] ?? {}}
              userReaction={userReactionsByPostId[item.id] ?? null}
              commentCount={commentCountByPostId[item.id] ?? 0}
              latestComment={latestCommentByPostId[item.id] ?? null}
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
          onEndReachedThreshold={0.5}
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
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonWrap: {
    flex: 1,
  },
  skeletonFeed: {
    padding: 16,
  },
  skeletonCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  skeletonInfo: {
    padding: 14,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skeletonHeaderText: {
    marginLeft: 10,
  },
  skeletonReactions: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
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
