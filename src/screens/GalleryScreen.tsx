/**
 * GalleryScreen.tsx
 *
 * Full gallery of user's posts (from Profile → View All Posts).
 *
 * Key responsibilities:
 * - 3-column grid of own posts
 * - Tap opens CardStack; long-press delete
 * - ProfileStack screen with header "All Posts"
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ProfileStackParamList, RootStackNavigationProp } from '../navigation/types';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../lib/AuthContext';
import { useCardStack } from '../lib/CardStackContext';
import { usePosts } from '../hooks';
import { useToast } from '../lib/ToastContext';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import type { PostWithProfile } from '../types';
import { CardStack } from '../components/CardStack';
import { SmoothImage } from '../components/SmoothImage';

const GRID_GAP = 4;
const GRID_PADDING = 24;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_CELL_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * 2) / 3;

type Props = NativeStackScreenProps<ProfileStackParamList, 'Gallery'>;

export function GalleryScreen({ navigation }: Props) {
  const { profile, session } = useAuth();
  const { removePost } = usePosts();
  const { showToast } = useToast();
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const { setCardStackOpen } = useCardStack();
  const userId = profile?.id ?? session?.user?.id;

  const navigateToFriendProfile = useCallback(
    (targetUserId: string) => {
      if (targetUserId === userId) {
        showToast("That's you!");
        return;
      }
      (navigation.getParent()?.getParent?.() as RootStackNavigationProp | undefined)?.navigate('FriendProfile', {
        userId: targetUserId,
      });
    },
    [navigation, userId, showToast]
  );

  const PAGE_SIZE = 30;
  const [posts, setPosts] = useState<PostWithProfile[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<PostWithProfile[] | null>(null);
  const [selectedInitialIndex, setSelectedInitialIndex] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());

  const fetchPosts = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('posts')
      .select('*, reaction_count, comment_count, profiles:user_id(username, display_name, avatar_url), post_tags(tagged_user_id, profiles:tagged_user_id(display_name, username))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) {
      __DEV__ && console.error('Error fetching gallery posts:', error);
      return;
    }
    setPosts((data ?? []) as PostWithProfile[]);
    setHasMore((data ?? []).length === PAGE_SIZE);
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !userId) return;
    setLoadingMore(true);
    try {
      const lastPost = posts[posts.length - 1];
      if (!lastPost) return;
      const { data, error } = await supabase
        .from('posts')
        .select('*, reaction_count, comment_count, profiles:user_id(username, display_name, avatar_url), post_tags(tagged_user_id, profiles:tagged_user_id(display_name, username))')
        .eq('user_id', userId)
        .lt('created_at', lastPost.created_at)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (error) {
        if (__DEV__) console.error('Error loading more gallery posts:', error);
        return;
      }
      const newPosts = (data ?? []) as PostWithProfile[];
      setPosts((prev) => [...prev, ...newPosts]);
      setHasMore(newPosts.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [userId, posts, loadingMore, hasMore]);

  useFocusEffect(
    useCallback(() => {
      fetchPosts();
      return () => {
        setSelectMode(false);
        setSelectedPostIds(new Set());
      };
    }, [fetchPosts])
  );

  useEffect(() => {
    setCardStackOpen(selectedPosts !== null);
    return () => setCardStackOpen(false);
  }, [selectedPosts, setCardStackOpen]);

  function handleLongPress(post: PostWithProfile) {
    if (post.user_id !== userId) return;
    setSelectMode(true);
    setSelectedPostIds(new Set([post.id]));
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  }

  function handleThumbnailPress(post: PostWithProfile, index: number) {
    if (selectMode) {
      if (post.user_id !== userId) return;
      setSelectedPostIds((prev) => {
        const next = new Set(prev);
        if (next.has(post.id)) {
          next.delete(post.id);
          if (next.size === 0) setSelectMode(false);
        } else {
          next.add(post.id);
        }
        return next;
      });
    } else {
      setSelectedPosts([post]);
      setSelectedInitialIndex(0);
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

  function handleBulkDelete() {
    const count = selectedPostIds.size;
    if (count === 0) return;
    Alert.alert(
      'Delete Posts',
      `Are you sure you want to delete ${count} ${count === 1 ? 'post' : 'posts'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const ids = Array.from(selectedPostIds);
              const { error } = await supabase.from('posts').delete().in('id', ids);
              if (error) throw error;

              for (const id of ids) {
                const p = posts.find((x) => x.id === id);
                if (p?.image_url) {
                  try {
                    const pathParts = p.image_url.split('/posts/');
                    if (pathParts[1]) {
                      const imagePath = pathParts[1].split('?')[0];
                      await supabase.storage.from('posts').remove([imagePath]);
                    }
                  } catch {}
                }
              }

              ids.forEach((id) => removePost(id));
              setSelectMode(false);
              setSelectedPostIds(new Set());
              setPosts((prev) => prev.filter((p) => !ids.includes(p.id)));
              setSelectedPosts((prev) => (prev ? prev.filter((p) => !ids.includes(p.id)) : null));

              fetchPosts();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err) {
              if (__DEV__) console.error('Bulk delete failed:', err);
              Alert.alert('Error', 'Failed to delete posts. Please try again.');
            }
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {selectMode ? (
        <View style={[styles.selectModeBar, { borderBottomColor: theme.colors.border }]}>
          <TouchableOpacity
            onPress={() => {
              setSelectMode(false);
              setSelectedPostIds(new Set());
            }}
          >
            <Text style={[styles.selectModeCancel, { color: theme.colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.selectModeCount, { color: theme.colors.text }]}>
            {selectedPostIds.size} selected
          </Text>
          <View style={styles.selectModeActions}>
            {selectedPostIds.size === 1 && (
              <TouchableOpacity
                onPress={() => {
                  const postId = Array.from(selectedPostIds)[0];
                  const post = posts.find((p) => p.id === postId);
                  if (post) {
                    setSelectMode(false);
                    setSelectedPostIds(new Set());
                    navigateToEditPost(post);
                  }
                }}
              >
                <Text style={[styles.selectModeEdit, { color: theme.colors.primary }]}>Edit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleBulkDelete}>
              <Text style={styles.selectModeDelete}>
                Delete{selectedPostIds.size > 0 ? ` (${selectedPostIds.size})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <FlatList
        data={posts}
        numColumns={3}
        keyExtractor={(item) => item.id}
        scrollEnabled={selectedPosts === null}
        contentContainerStyle={styles.gridContainer}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        removeClippedSubviews={true}
        windowSize={7}
        maxToRenderPerBatch={12}
        initialNumToRender={15}
        getItemLayout={(_data, index) => {
          const row = Math.floor(index / 3);
          return { length: GRID_CELL_SIZE, offset: row * (GRID_CELL_SIZE + GRID_GAP), index };
        }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={{ padding: 16 }} />
          ) : null
        }
        renderItem={({ item: post, index }) => (
          <TouchableOpacity
            style={styles.gridCell}
            onPress={() => handleThumbnailPress(post, index)}
            onLongPress={() => handleLongPress(post)}
            delayLongPress={400}
            activeOpacity={0.7}
          >
            {imageErrors[post.id] ? (
              <View style={styles.gridImagePlaceholder}>
                <Feather name="image" size={24} color={theme.colors.textTertiary} />
              </View>
            ) : (
              <>
                <SmoothImage
                  source={{ uri: post.image_url }}
                  style={styles.gridImage}
                  resizeMode="cover"
                  onError={() => setImageErrors((prev) => ({ ...prev, [post.id]: true }))}
                />
                {selectMode && post.user_id === userId && (
                  <View
                    style={[
                      StyleSheet.absoluteFillObject,
                      {
                        backgroundColor: selectedPostIds.has(post.id)
                          ? 'rgba(255,45,85,0.3)'
                          : 'rgba(0,0,0,0.1)',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.selectCheck,
                        {
                          backgroundColor: selectedPostIds.has(post.id)
                            ? theme.colors.primary
                            : theme.colors.overlayLight,
                        },
                      ]}
                    >
                      {selectedPostIds.has(post.id) && (
                        <Feather name="check" size={14} color={theme.colors.white} />
                      )}
                    </View>
                  </View>
                )}
                {selectMode && post.user_id !== userId && (
                  <View
                    style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(255,255,255,0.6)' }]}
                  />
                )}
              </>
            )}
          </TouchableOpacity>
        )}
      />

      {selectedPosts !== null && selectedPosts.length > 0 && (
        <CardStack
          posts={selectedPosts}
          onClose={() => {
            setSelectedPosts(null);
            setSelectedInitialIndex(0);
          }}
          initialIndex={selectedInitialIndex}
          onPostDeleted={(postId) => {
            removePost(postId);
            setPosts((prev) => prev.filter((p) => p.id !== postId));
            setSelectedPosts((prev) => (prev ? prev.filter((p) => p.id !== postId) : null));
          }}
          onProfilePress={navigateToFriendProfile}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gridContainer: { padding: theme.screenPadding, paddingBottom: theme.spacing.xl },
  columnWrapper: { gap: GRID_GAP, marginBottom: GRID_GAP },
  gridCell: {
    width: GRID_CELL_SIZE,
    height: GRID_CELL_SIZE,
    borderRadius: 4,
    overflow: 'hidden',
  },
  gridImage: { width: '100%', height: '100%' },
  gridImagePlaceholder: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectModeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
  },
  selectModeCancel: { fontSize: 16, fontWeight: '600' },
  selectModeCount: { fontSize: 16, fontWeight: '700' },
  selectModeActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  selectModeEdit: { fontSize: 16, fontWeight: '600' },
  selectModeDelete: { fontSize: 16, color: '#FF3B30', fontWeight: '600' },
  selectCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
