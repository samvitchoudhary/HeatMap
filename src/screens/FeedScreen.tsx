import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import type { PostWithProfile } from '../types';
import { FeedCard, type FeedLatestComment } from '../components/FeedCard';

export type FeedReactionCounts = Record<string, Record<string, number>>;
export type FeedUserReactions = Record<string, string | null>;
export type FeedCommentCounts = Record<string, number>;

type FeedScreenNav = NativeStackNavigationProp<RootStackParamList>;

export function FeedScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<FeedScreenNav>();
  const { profile } = useAuth();
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
  const hasInitiallyFetched = useRef(false);

  const PAGE_SIZE = 20;

  const fetchPage = useCallback(
    async (offset: number, append: boolean, silent = false) => {
      const userId = profile?.id;
      if (!userId) {
        setLoading(false);
        return;
      }
      if (!silent) {
        if (offset === 0) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
      }

      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted');

      const friendIds =
        friendships?.map((f) =>
          f.requester_id === userId ? f.addressee_id : f.requester_id
        ) ?? [];
      const allowedIds = [userId, ...friendIds];

      const { data: postsData, error } = await supabase
        .from('posts')
        .select('*, profiles:user_id(username, display_name, avatar_url)')
        .in('user_id', allowedIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error('Error fetching feed posts:', error);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const postsList = (postsData ?? []) as PostWithProfile[];
      setHasMore(postsList.length === PAGE_SIZE);

      if (append) {
        setPosts((prev) => [...prev, ...postsList]);
      } else {
        setPosts(postsList);
      }

      const postIds = postsList.map((p) => p.id);
      if (postIds.length === 0) {
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
        .select('*')
        .in('post_id', postIds);

      const { data: comments } = await supabase
        .from('comments')
        .select('*, profiles:user_id(display_name, username)')
        .in('post_id', postIds)
        .order('created_at', { ascending: false });

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

      setLoading(false);
      setLoadingMore(false);
    },
    [profile?.id]
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
    await fetchPage(0, false);
    setRefreshing(false);
  }

  const handleDeletePost = useCallback(
    async (post: PostWithProfile) => {
      try {
        const imagePath = post.image_url.split('/posts/')[1]?.split('?')[0];
        if (imagePath) {
          await supabase.storage.from('posts').remove([imagePath]);
        }
        await supabase.from('posts').delete().eq('id', post.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setFadingOutId(post.id);
      } catch (err) {
        console.error('Error deleting post:', err);
      }
    },
    []
  );

  const handleFadeComplete = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setFadingOutId(null);
  }, []);

  function handleEndReached() {
    if (loadingMore || !hasMore || loading || posts.length === 0) return;
    fetchPage(posts.length, true);
  }

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
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.headerTitle}>Activity</Text>
      </View>

      {loading && posts.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.colors.text} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          renderItem={({ item }) => (
            <FeedCard
              post={item}
              reactionCounts={reactionsByPostId[item.id] ?? {}}
              userReaction={userReactionsByPostId[item.id] ?? null}
              commentCount={commentCountByPostId[item.id] ?? 0}
              latestComment={latestCommentByPostId[item.id] ?? null}
              onReactionChange={(counts, userReaction) => {
                setReactionsByPostId((prev) => ({ ...prev, [item.id]: counts }));
                setUserReactionsByPostId((prev) => ({ ...prev, [item.id]: userReaction }));
              }}
              onCommentPosted={(count, latestComment) => {
                setCommentCountByPostId((prev) => ({ ...prev, [item.id]: count }));
                setLatestCommentByPostId((prev) => ({
                  ...prev,
                  [item.id]: latestComment,
                }));
              }}
              onVenuePress={(latitude, longitude) => {
                navigation.navigate('Map', { latitude, longitude });
              }}
              onProfilePress={(userId) => {
                (navigation.getParent() as any)?.navigate('FriendProfile', { userId });
              }}
              onDeletePost={handleDeletePost}
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
