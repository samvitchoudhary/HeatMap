import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { PostWithProfile } from '../types';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import { Skeleton } from './Skeleton';
import { ReactionBar } from './ReactionBar';
import { CommentSheet } from './CommentSheet';

const CARD_MARGIN_H = 20;
const CARD_MARGIN_V = 10;
const PHOTO_ASPECT_RATIO = 4 / 5;
const BOTTOM_BAR_HEIGHT = 50;
const CARD_BORDER_RADIUS = 16;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - CARD_MARGIN_H * 2;

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

export type FeedLatestComment = {
  id: string;
  content: string;
  profiles: { display_name: string } | null;
};

type FeedCardProps = {
  post: PostWithProfile;
  reactionCounts: Record<string, number>;
  userReaction: string | null;
  commentCount: number;
  latestComment: FeedLatestComment | null;
  onReactionChange?: (counts: Record<string, number>, userReaction: string | null) => void;
  onCommentPosted?: (count: number, latestComment: FeedLatestComment | null) => void;
  onVenuePress?: (latitude: number, longitude: number) => void;
  onProfilePress?: (userId: string) => void;
  onDeletePost?: (post: PostWithProfile) => void;
  isFadingOut?: boolean;
  onFadeComplete?: (postId: string) => void;
};

export function FeedCard({
  post,
  reactionCounts: initialReactionCounts,
  userReaction: initialUserReaction,
  commentCount,
  latestComment,
  onReactionChange,
  onCommentPosted,
  onVenuePress,
  onProfilePress,
  onDeletePost,
  isFadingOut,
  onFadeComplete,
}: FeedCardProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isFadingOut) {
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => onFadeComplete?.(post.id));
    }
  }, [isFadingOut, cardOpacity, onFadeComplete, post.id]);

  useEffect(() => {
    if (imageLoaded) {
      Animated.timing(imageOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [imageLoaded, imageOpacity]);

  const handleReactionToggle = useCallback(
    (emoji: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (!userId) return;
      const prevReaction = initialUserReaction;
      const prevCounts = { ...initialReactionCounts };

      if (prevReaction === emoji) {
        onReactionChange?.(
          { ...prevCounts, [emoji]: Math.max(0, (prevCounts[emoji] ?? 1) - 1) },
          null
        );
      } else {
        const nextCounts = { ...prevCounts };
        if (prevReaction) {
          nextCounts[prevReaction] = Math.max(0, (nextCounts[prevReaction] ?? 1) - 1);
        }
        nextCounts[emoji] = (nextCounts[emoji] ?? 0) + 1;
        onReactionChange?.(nextCounts, emoji);
      }

      if (prevReaction === emoji) {
        supabase
          .from('reactions')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', userId)
          .then(() => {});
      } else {
        if (prevReaction) {
          supabase.from('reactions').delete().eq('post_id', post.id).eq('user_id', userId).then(() => {});
        }
        supabase
          .from('reactions')
          .insert({ post_id: post.id, user_id: userId, emoji })
          .then(() => {});
      }
    },
    [post.id, userId, initialUserReaction, initialReactionCounts, onReactionChange]
  );

  const handleCommentPosted = useCallback(async () => {
    const { count, error: countError } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id);
    const newCount = countError ? commentCount : (count ?? commentCount);

    const { data: commentData, error: listError } = await supabase
      .from('comments')
      .select('id, content, profiles:user_id(display_name)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const newLatest: FeedLatestComment | null =
      !listError && commentData?.length
        ? {
            id: commentData[0].id,
            content: commentData[0].content,
            profiles: (commentData[0] as { profiles?: { display_name: string } | null }).profiles ?? null,
          }
        : null;

    onCommentPosted?.(newCount, newLatest);
  }, [post.id, commentCount, onCommentPosted]);

  const displayName = post.profiles?.display_name ?? 'Unknown';
  const venueName = post.venue_name ?? 'Unknown location';

  const handleDeletePress = useCallback(() => {
    Alert.alert('Delete Post', "Are you sure? This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDeletePost?.(post) },
    ]);
  }, [post, onDeletePost]);

  return (
    <Animated.View style={[styles.card, { opacity: cardOpacity }]}>
      <CommentSheet
        postId={post.id}
        post={{ image_url: post.image_url, venue_name: post.venue_name }}
        userId={userId}
        cardHeight={CARD_WIDTH / PHOTO_ASPECT_RATIO + 150}
        cardWidth={CARD_WIDTH}
        cardBorderRadius={CARD_BORDER_RADIUS}
        contentSized
        onCommentPosted={handleCommentPosted}
      >
        {({ onCommentPress, commentCount: sheetCommentCount }) => (
          <>
            <View style={styles.photoSection}>
              {!imageLoaded && !imageError && (
                <View style={styles.skeletonWrap}>
                  <Skeleton width="100%" height="100%" borderRadius={0} />
                </View>
              )}
              {imageError ? (
                <View style={[styles.photoPlaceholder, styles.photoError]}>
                  <Feather name="image" size={24} color={theme.colors.textTertiary} />
                </View>
              ) : (
                <Animated.View style={[styles.photo, { opacity: imageOpacity }]}>
                <Image
                  source={{ uri: post.image_url }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageError(true)}
                  />
                </Animated.View>
              )}
              {onDeletePost && post.user_id === userId && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDeletePress}
                  activeOpacity={0.7}
                >
                  <Feather name="trash-2" size={16} color={theme.colors.red} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.infoSection}>
              {onProfilePress ? (
                <TouchableOpacity
                  onPress={() => onProfilePress(post.user_id)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Text style={styles.infoDisplayName} numberOfLines={1}>
                    {displayName}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.infoDisplayName} numberOfLines={1}>
                  {displayName}
                </Text>
              )}
              <TouchableOpacity
                style={styles.infoVenueRow}
                onPress={() => {
                  const lat = post.latitude;
                  const lng = post.longitude;
                  if (typeof lat === 'number' && typeof lng === 'number' && onVenuePress) {
                    onVenuePress(lat, lng);
                  }
                }}
                activeOpacity={0.7}
                disabled={
                  !onVenuePress ||
                  typeof post.latitude !== 'number' ||
                  typeof post.longitude !== 'number'
                }
              >
                <Feather name="map-pin" size={12} color={theme.colors.primary} />
                <Text style={styles.infoVenueText} numberOfLines={1}>
                  {venueName}
                </Text>
              </TouchableOpacity>
              {post.caption?.trim() ? (
                <Text style={styles.infoCaption} numberOfLines={1}>
                  {post.caption}
                </Text>
              ) : null}
              <Text style={styles.infoTimestamp}>{timeAgo(post.created_at)}</Text>
            </View>
            <View style={styles.bottomBar}>
              <View style={styles.reactionsSection}>
                <ReactionBar
                  counts={initialReactionCounts}
                  userReaction={initialUserReaction}
                  onEmojiPress={handleReactionToggle}
                  cardStackBar
                />
              </View>
              <Pressable style={styles.commentButton} onPress={onCommentPress}>
                {({ pressed }) => (
                  <>
                    <Feather
                      name="message-circle"
                      size={20}
                      color={pressed ? theme.colors.primary : theme.colors.textSecondary}
                    />
                    <Text style={styles.commentCountText}>{sheetCommentCount}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </>
        )}
      </CommentSheet>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: CARD_BORDER_RADIUS,
    marginHorizontal: CARD_MARGIN_H,
    marginVertical: CARD_MARGIN_V,
    borderWidth: 0,
    ...theme.shadows.card,
  },
  photoSection: {
    position: 'relative',
    width: '100%',
    aspectRatio: 4 / 5,
    overflow: 'hidden',
    borderTopLeftRadius: CARD_BORDER_RADIUS,
    borderTopRightRadius: CARD_BORDER_RADIUS,
  },
  skeletonWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  photoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoError: {
    backgroundColor: theme.colors.surface,
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  infoSection: {
    padding: 12,
    backgroundColor: theme.colors.cardBackground,
  },
  infoDisplayName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  infoVenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  infoVenueText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  infoCaption: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  infoTimestamp: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  deleteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: BOTTOM_BAR_HEIGHT,
    paddingHorizontal: 12,
    paddingBottom: 8,
    marginBottom: 0,
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.cardBackground,
    borderBottomLeftRadius: CARD_BORDER_RADIUS,
    borderBottomRightRadius: CARD_BORDER_RADIUS,
  },
  reactionsSection: {
    flex: 1,
    minWidth: 0,
  },
  commentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  commentCountText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
});
