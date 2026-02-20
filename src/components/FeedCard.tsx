import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
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
import { Avatar } from './Avatar';
import { Skeleton } from './Skeleton';
import { ReactionBar } from './ReactionBar';
import { FeedCommentModal } from './FeedCommentModal';

const CARD_MARGIN_H = 20;
const CARD_MARGIN_V = 8;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - CARD_MARGIN_H * 2;
const IMAGE_MAX_HEIGHT = 400;

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
  userReactions: Set<string>;
  commentCount: number;
  latestComment: FeedLatestComment | null;
  onReactionChange?: (counts: Record<string, number>, userReactions: Set<string>) => void;
  onCommentPosted?: (count: number, latestComment: FeedLatestComment | null) => void;
  onVenuePress?: (latitude: number, longitude: number) => void;
  onDeletePost?: (post: PostWithProfile) => void;
  isFadingOut?: boolean;
  onFadeComplete?: (postId: string) => void;
};

export function FeedCard({
  post,
  reactionCounts: initialReactionCounts,
  userReactions: initialUserReactions,
  commentCount,
  latestComment,
  onReactionChange,
  onCommentPosted,
  onVenuePress,
  onDeletePost,
  isFadingOut,
  onFadeComplete,
}: FeedCardProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
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
      const alreadyReacted = initialUserReactions.has(emoji);
      const nextUser = new Set(initialUserReactions);
      const nextCounts = { ...initialReactionCounts };
      if (alreadyReacted) {
        nextUser.delete(emoji);
        nextCounts[emoji] = Math.max(0, (nextCounts[emoji] ?? 1) - 1);
      } else {
        nextUser.add(emoji);
        nextCounts[emoji] = (nextCounts[emoji] ?? 0) + 1;
      }
      onReactionChange?.(nextCounts, nextUser);

      if (alreadyReacted) {
        supabase
          .from('reactions')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', userId)
          .eq('emoji', emoji)
          .then(() => {});
      } else {
        supabase
          .from('reactions')
          .insert({ post_id: post.id, user_id: userId, emoji })
          .then(() => {});
      }
    },
    [post.id, userId, initialUserReactions, initialReactionCounts, onReactionChange]
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
      <View style={styles.headerRow}>
        <Avatar uri={post.profiles?.avatar_url ?? null} size={36} />
        <View style={styles.headerInfo}>
          <Text style={styles.displayName} numberOfLines={1}>
            {displayName}
          </Text>
          <TouchableOpacity
            style={styles.venueRow}
            onPress={() => {
              const lat = post.latitude;
              const lng = post.longitude;
              if (typeof lat === 'number' && typeof lng === 'number' && onVenuePress) {
                onVenuePress(lat, lng);
              }
            }}
            activeOpacity={0.7}
            disabled={!onVenuePress || typeof post.latitude !== 'number' || typeof post.longitude !== 'number'}
          >
            <Feather name="map-pin" size={12} color={theme.colors.textSecondary} />
            <Text style={[styles.venueName, onVenuePress && styles.venueNameTappable]} numberOfLines={1}>
              {venueName}
            </Text>
          </TouchableOpacity>
        </View>
        {onDeletePost && post.user_id === userId && (
          <TouchableOpacity
            style={styles.moreButton}
            onPress={handleDeletePress}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="more-horizontal" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        )}
        <Text style={styles.timestamp}>{timeAgo(post.created_at)}</Text>
      </View>

      <View style={styles.photoWrap}>
        {!imageLoaded && !imageError && (
          <View style={styles.skeletonWrap}>
            <Skeleton width="100%" height={IMAGE_MAX_HEIGHT} borderRadius={0} />
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
      </View>

      <View style={styles.interactionRow}>
        <ReactionBar
          counts={initialReactionCounts}
          userReactions={initialUserReactions}
          onEmojiPress={handleReactionToggle}
          compact
        />
        <TouchableOpacity
          style={styles.commentButton}
          onPress={() => setCommentModalVisible(true)}
          activeOpacity={0.7}
        >
          <Feather name="message-circle" size={18} color={theme.colors.textSecondary} />
          {commentCount > 0 && (
            <Text style={styles.commentCount}>{commentCount}</Text>
          )}
        </TouchableOpacity>
      </View>

      {post.caption?.trim() ? (
        <View style={styles.captionRow}>
          <Text style={styles.captionText}>
            <Text style={styles.captionName}>{displayName} </Text>
            {post.caption}
          </Text>
        </View>
      ) : null}

      {latestComment ? (
        <View style={styles.commentsPreview}>
          <Text style={styles.commentPreviewText} numberOfLines={1}>
            <Text style={styles.commentPreviewName}>
              {latestComment.profiles?.display_name ?? 'Unknown'}
            </Text>
            {' '}
            {latestComment.content}
          </Text>
          {commentCount > 1 && (
            <TouchableOpacity
              onPress={() => setCommentModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.viewAllComments}>
                View all {commentCount} comments
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : commentCount > 0 ? (
        <TouchableOpacity
          style={styles.viewAllWrap}
          onPress={() => setCommentModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.viewAllComments}>
            View all {commentCount} comments
          </Text>
        </TouchableOpacity>
      ) : null}

      <FeedCommentModal
        visible={commentModalVisible}
        postId={post.id}
        userId={userId}
        onClose={() => setCommentModalVisible(false)}
        onCommentPosted={handleCommentPosted}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    marginHorizontal: CARD_MARGIN_H,
    marginVertical: CARD_MARGIN_V,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  headerInfo: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  displayName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  venueName: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  venueNameTappable: {
    color: theme.colors.text,
    textDecorationLine: 'underline',
    textDecorationColor: theme.colors.textSecondary,
  },
  moreButton: {
    padding: 4,
  },
  timestamp: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  photoWrap: {
    width: '100%',
    maxHeight: IMAGE_MAX_HEIGHT,
    backgroundColor: theme.colors.surfaceLight,
  },
  skeletonWrap: {
    width: '100%',
    height: IMAGE_MAX_HEIGHT,
  },
  photo: {
    width: '100%',
    height: IMAGE_MAX_HEIGHT,
  },
  photoPlaceholder: {
    width: '100%',
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoError: {
    backgroundColor: theme.colors.surface,
  },
  interactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  commentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  commentCount: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  captionRow: {
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 14,
  },
  captionText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  captionName: {
    fontWeight: '600',
    color: theme.colors.text,
  },
  commentsPreview: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  commentPreviewText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  commentPreviewName: {
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  viewAllComments: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginTop: 4,
  },
  viewAllWrap: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
});
