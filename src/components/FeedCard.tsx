import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { PostWithProfile, PostTag } from '../types';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import { SmoothImage } from './SmoothImage';
import { ReactionBar } from './ReactionBar';
import { CommentSheet } from './CommentSheet';

const CARD_MARGIN_H = 20;
const CARD_MARGIN_V = 10;
const PHOTO_ASPECT_RATIO = 4 / 5;
const BOTTOM_BAR_HEIGHT = 50;
const CARD_BORDER_RADIUS = 16;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - CARD_MARGIN_H * 2;

function TaggedLine({ tags, onProfilePress }: { tags: PostTag[] | undefined; onProfilePress?: (userId: string) => void }) {
  if (!tags || tags.length === 0) return null;
  const maxShow = 2;
  const shown = tags.slice(0, maxShow);
  const rest = tags.length - maxShow;
  return (
    <Text style={styles.infoTaggedLine} numberOfLines={1}>
      {' with '}
      {shown.map((t, i) => {
        const username = t.profiles?.username ?? 'user';
        const content = `@${username}`;
        return onProfilePress ? (
          <Text key={t.tagged_user_id}>
            {i > 0 ? ', ' : ''}
            <Text style={styles.infoTaggedLink} onPress={() => onProfilePress(t.tagged_user_id)}>
              {content}
            </Text>
          </Text>
        ) : (
          <Text key={t.tagged_user_id}>{i > 0 ? `, ${content}` : content}</Text>
        );
      })}
      {rest > 0 ? ` +${rest} others` : ''}
    </Text>
  );
}

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
  isNew?: boolean;
  reactionCounts: Record<string, number>;
  userReaction: string | null;
  commentCount: number;
  latestComment: FeedLatestComment | null;
  onReactionChange?: (postId: string, counts: Record<string, number>, userReaction: string | null) => void;
  onCommentPosted?: (postId: string, count: number, latestComment: FeedLatestComment | null) => void;
  onVenuePress?: (latitude: number, longitude: number) => void;
  onProfilePress?: (userId: string) => void;
  onDeletePost?: (post: PostWithProfile) => void;
  onExpandPhoto?: (imageUrl: string) => void;
  isFadingOut?: boolean;
  onFadeComplete?: (postId: string) => void;
};

const FeedCardInner = function FeedCard({
  post,
  isNew,
  reactionCounts: initialReactionCounts,
  userReaction: initialUserReaction,
  commentCount,
  latestComment,
  onReactionChange,
  onCommentPosted,
  onVenuePress,
  onProfilePress,
  onDeletePost,
  onExpandPhoto,
  isFadingOut,
  onFadeComplete,
}: FeedCardProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [imageError, setImageError] = useState(false);
  const [heartVisible, setHeartVisible] = useState(false);
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(1)).current;
  const heartTranslateY = useRef(new Animated.Value(0)).current;
  const heartRotate = useRef(new Animated.Value(0)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);

  useEffect(() => {
    if (isFadingOut) {
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => onFadeComplete?.(post.id));
    }
  }, [isFadingOut, cardOpacity, onFadeComplete, post.id]);

  const triggerHeartReaction = useCallback(() => {
    if (!userId) return;
    if (initialUserReaction === '❤️') return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const prevCounts = { ...initialReactionCounts };
    if (initialUserReaction) {
      prevCounts[initialUserReaction] = Math.max(0, (prevCounts[initialUserReaction] ?? 1) - 1);
    }
    prevCounts['❤️'] = (prevCounts['❤️'] ?? 0) + 1;
    onReactionChange?.(post.id, prevCounts, '❤️');

    if (initialUserReaction) {
      supabase.from('reactions').delete().eq('post_id', post.id).eq('user_id', userId).then(() => {});
    }
    supabase
      .from('reactions')
      .insert({ post_id: post.id, user_id: userId, emoji: '❤️' })
      .then(async () => {
        if (post.user_id !== userId) {
          await supabase.from('notifications').insert({
            user_id: post.user_id,
            type: 'reaction',
            from_user_id: userId,
            post_id: post.id,
            emoji: '❤️',
          });
        }
      });

    setHeartVisible(true);
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    heartTranslateY.setValue(0);
    heartRotate.setValue(0);
    flashOpacity.setValue(0.3);

    Animated.parallel([
      // Heart animation
      Animated.sequence([
        // Pop in big
        Animated.spring(heartScale, {
          toValue: 1.3,
          speed: 80,
          bounciness: 12,
          useNativeDriver: true,
        }),
        // Settle to normal size
        Animated.spring(heartScale, {
          toValue: 1.0,
          speed: 40,
          bounciness: 8,
          useNativeDriver: true,
        }),
        // Brief hold
        Animated.delay(200),
        // Fly up, shrink, and fade out simultaneously
        Animated.parallel([
          Animated.timing(heartTranslateY, {
            toValue: -400,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(heartScale, {
            toValue: 0.3,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(heartOpacity, {
            toValue: 0,
            duration: 400,
            delay: 100,
            useNativeDriver: true,
          }),
          Animated.timing(heartRotate, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ]),
      // Screen flash (keep same as before)
      Animated.sequence([
        Animated.timing(flashOpacity, {
          toValue: 0.25,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(flashOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setHeartVisible(false);
      heartScale.setValue(0);
      heartOpacity.setValue(1);
      heartTranslateY.setValue(0);
      heartRotate.setValue(0);
      flashOpacity.setValue(0);
    });
  }, [
    userId,
    post.id,
    post.user_id,
    initialUserReaction,
    initialReactionCounts,
    onReactionChange,
    heartScale,
    heartOpacity,
    heartTranslateY,
    heartRotate,
    flashOpacity,
  ]);

  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      triggerHeartReaction();
    }
    lastTap.current = now;
  }, [triggerHeartReaction]);

  const handleReactionToggle = useCallback(
    (emoji: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (!userId) return;
      const prevReaction = initialUserReaction;
      const prevCounts = { ...initialReactionCounts };

      if (prevReaction === emoji) {
        onReactionChange?.(
          post.id,
          { ...prevCounts, [emoji]: Math.max(0, (prevCounts[emoji] ?? 1) - 1) },
          null
        );
      } else {
        const nextCounts = { ...prevCounts };
        if (prevReaction) {
          nextCounts[prevReaction] = Math.max(0, (nextCounts[prevReaction] ?? 1) - 1);
        }
        nextCounts[emoji] = (nextCounts[emoji] ?? 0) + 1;
        onReactionChange?.(post.id, nextCounts, emoji);
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
          .then(async () => {
            const shouldNotify = post.user_id !== userId;
            if (shouldNotify) {
              await supabase.from('notifications').insert({
                user_id: post.user_id,
                type: 'reaction',
                from_user_id: userId,
                post_id: post.id,
                emoji,
              });
            }
          });
      }
    },
    [post.id, post.user_id, userId, initialUserReaction, initialReactionCounts, onReactionChange]
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

    onCommentPosted?.(post.id, newCount, newLatest);
  }, [post.id, commentCount, onCommentPosted]);

  const displayName = post.user_id === userId ? 'You' : (post.profiles?.display_name ?? 'Unknown');
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
        postUserId={post.user_id}
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
              {isNew && (
                <View style={styles.newPostDot} />
              )}
              {imageError ? (
                <View style={[styles.photoPlaceholder, styles.photoError]}>
                  <Feather name="image" size={24} color={theme.colors.textTertiary} />
                </View>
              ) : (
                <TouchableWithoutFeedback onPress={handleDoubleTap}>
                  <View style={styles.photo}>
                    <SmoothImage
                      source={{ uri: post.image_url }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                      onError={() => setImageError(true)}
                    />
                    {/* White screen flash */}
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        StyleSheet.absoluteFill,
                        {
                          backgroundColor: '#FFF',
                          opacity: flashOpacity,
                        },
                      ]}
                    />
                    {/* Heart emoji */}
                    {heartVisible && (
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          styles.heartOverlay,
                          {
                            opacity: heartOpacity,
                            transform: [
                              { scale: heartScale },
                              { translateY: heartTranslateY },
                              {
                                rotate: heartRotate.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: ['0deg', '-15deg'],
                                }),
                              },
                            ],
                          },
                        ]}
                      >
                        <Text style={styles.heartEmoji}>❤️</Text>
                      </Animated.View>
                    )}
                  </View>
                </TouchableWithoutFeedback>
              )}
              {!imageError && onExpandPhoto && (
                <TouchableOpacity
                  style={styles.expandButton}
                  onPress={() => onExpandPhoto(post.image_url)}
                  activeOpacity={0.7}
                >
                  <Feather name="maximize-2" size={16} color="#FFF" />
                </TouchableOpacity>
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
              <TaggedLine tags={post.post_tags} onProfilePress={onProfilePress} />
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
};

export const FeedCard = React.memo(FeedCardInner);

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: CARD_BORDER_RADIUS,
    marginHorizontal: CARD_MARGIN_H,
    marginVertical: CARD_MARGIN_V,
    borderWidth: 0,
    ...theme.shadows.card,
  },
  newPostDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: '#FFF',
    zIndex: 1,
  },
  photoSection: {
    position: 'relative',
    width: '100%',
    aspectRatio: 4 / 5,
    overflow: 'hidden',
    borderTopLeftRadius: CARD_BORDER_RADIUS,
    borderTopRightRadius: CARD_BORDER_RADIUS,
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
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartEmoji: {
    fontSize: 80,
    textShadowColor: 'rgba(255, 50, 50, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
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
  infoTaggedLine: {
    fontSize: 12,
    fontStyle: 'italic',
    color: theme.colors.textSecondary,
    marginTop: 1,
    marginBottom: 2,
  },
  infoTaggedLink: {
    color: theme.colors.primary,
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
  expandButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
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
