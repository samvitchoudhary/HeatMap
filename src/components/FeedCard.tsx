/**
 * FeedCard.tsx
 *
 * NOTE: This file is over 600 lines. Future refactoring candidates:
 * - Extract useDoubleTapHeart hook (tap detection, heart animation values, flash animation)
 * - Extract useReactionToggle hook (upsert/delete reaction with optimistic updates + notifications)
 * - Extract HeartOverlay component (animated heart burst with scale, rotate, fade)
 * - Extract CategoryBadge component (dot + label pill, reusable across FeedCard and CardStack)
 *
 * Individual post card in the Feed tab.
 *
 * Key responsibilities:
 * - Displays photo, author, venue, caption, reactions, comment preview
 * - Double-tap heart, reaction bar, flip-to-comments (CommentSheet)
 * - Fade-out animation on delete, expand photo, navigate to venue/profile
 */

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
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { PostWithProfile } from '../types';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { shouldSendNotification } from '../lib/notifications';
import { theme } from '../lib/theme';
import { SmoothImage } from './SmoothImage';
import { ReactionBar } from './ReactionBar';
import { CommentSheet } from './CommentSheet';
import { timeAgo } from '../lib/timeAgo';
import { getCategoryByKey } from '../lib/categories';
import { TaggedLine } from './TaggedLine';

const CARD_MARGIN_H = 20;
const CARD_MARGIN_V = 10;
/** Photo height = width * 5/4 for portrait-ish cards */
const PHOTO_ASPECT_RATIO = 4 / 5;
const BOTTOM_BAR_HEIGHT = 50;
const CARD_BORDER_RADIUS = 16;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - CARD_MARGIN_H * 2;

/** Latest comment preview - used for "View N comments" preview text */
export type FeedLatestComment = {
  id: string;
  content: string;
  profiles: { display_name: string } | null;
};

type FeedPostWithCounts = PostWithProfile & {
  reaction_counts?: Record<string, number>;
  user_reaction?: string | null;
  comment_count?: number;
};

type FeedCardProps = {
  post: FeedPostWithCounts;
  isNew?: boolean;
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
  onReactionChange,
  onCommentPosted,
  onVenuePress,
  onProfilePress,
  onDeletePost,
  onExpandPhoto,
  isFadingOut,
  onFadeComplete,
}: FeedCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const feedCardWidth = screenWidth - CARD_MARGIN_H * 2;
  const { session } = useAuth();
  const userId = session?.user?.id;

  const initialReactionCounts = post.reaction_counts ?? {};
  const initialUserReaction = post.user_reaction ?? null;
  const commentCount = post.comment_count ?? 0;

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

  const triggerHeartReaction = useCallback(async () => {
    if (!userId) return;
    if (initialUserReaction === '❤️') return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const previousReaction = initialUserReaction;
    const previousCounts = { ...initialReactionCounts };
    const prevCounts = { ...previousCounts };
    if (initialUserReaction) {
      prevCounts[initialUserReaction] = Math.max(0, (prevCounts[initialUserReaction] ?? 1) - 1);
    }
    prevCounts['❤️'] = (prevCounts['❤️'] ?? 0) + 1;
    onReactionChange?.(post.id, prevCounts, '❤️');

    try {
      if (initialUserReaction) {
        await supabase
          .from('notifications')
          .delete()
          .eq('from_user_id', userId)
          .eq('post_id', post.id)
          .eq('type', 'reaction');
      }
      const { error } = await supabase
        .from('reactions')
        .upsert({ post_id: post.id, user_id: userId, emoji: '❤️' }, { onConflict: 'post_id,user_id' });
      if (error) throw error;
      if (post.user_id !== userId) {
        const ok = await shouldSendNotification(post.user_id, 'reaction');
        if (ok) {
          const { error: notifErr } = await supabase.from('notifications').insert({
            user_id: post.user_id,
            type: 'reaction',
            from_user_id: userId,
            post_id: post.id,
            emoji: '❤️',
          });
          if (notifErr) throw notifErr;
        }
      }
    } catch (err) {
      if (__DEV__) console.error('Reaction failed:', err);
      onReactionChange?.(post.id, previousCounts, previousReaction);
      Alert.alert('Error', 'Could not save reaction. Please try again.');
      return;
    }

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
    async (emoji: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (!userId) return;
      const previousReaction = initialUserReaction;
      const previousCounts = { ...initialReactionCounts };

      let nextCounts: Record<string, number>;
      let nextReaction: string | null;
      if (previousReaction === emoji) {
        nextCounts = { ...previousCounts, [emoji]: Math.max(0, (previousCounts[emoji] ?? 1) - 1) };
        nextReaction = null;
        onReactionChange?.(post.id, nextCounts, nextReaction);
      } else {
        nextCounts = { ...previousCounts };
        if (previousReaction) {
          nextCounts[previousReaction] = Math.max(0, (nextCounts[previousReaction] ?? 1) - 1);
        }
        nextCounts[emoji] = (nextCounts[emoji] ?? 0) + 1;
        nextReaction = emoji;
        onReactionChange?.(post.id, nextCounts, nextReaction);
      }

      try {
        if (previousReaction === emoji) {
          const { error } = await supabase.from('reactions').delete().eq('post_id', post.id).eq('user_id', userId);
          if (error) throw error;
          await supabase
            .from('notifications')
            .delete()
            .eq('from_user_id', userId)
            .eq('post_id', post.id)
            .eq('type', 'reaction');
        } else {
          if (previousReaction) {
            await supabase
              .from('notifications')
              .delete()
              .eq('from_user_id', userId)
              .eq('post_id', post.id)
              .eq('type', 'reaction');
          }
          const { error } = await supabase
            .from('reactions')
            .upsert({ post_id: post.id, user_id: userId, emoji }, { onConflict: 'post_id,user_id' });
          if (error) throw error;
          if (post.user_id !== userId) {
            const ok = await shouldSendNotification(post.user_id, 'reaction');
            if (ok) {
              const { error: notifErr } = await supabase.from('notifications').insert({
                user_id: post.user_id,
                type: 'reaction',
                from_user_id: userId,
                post_id: post.id,
                emoji,
              });
              if (notifErr) throw notifErr;
            }
          }
        }
      } catch (err) {
        if (__DEV__) console.error('Reaction failed:', err);
        onReactionChange?.(post.id, previousCounts, previousReaction);
        Alert.alert('Error', 'Could not save reaction. Please try again.');
      }
    },
    [post.id, post.user_id, userId, initialUserReaction, initialReactionCounts, onReactionChange]
  );

  const handleCommentPosted = useCallback(async () => {
    const newCount = commentCount + 1;

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

  const displayName = post.user_id === userId ? 'You' : (post.profiles?.display_name ?? 'Deleted User');
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
        cardHeight={feedCardWidth / PHOTO_ASPECT_RATIO + 150}
        cardWidth={feedCardWidth}
        cardBorderRadius={CARD_BORDER_RADIUS}
        contentSized
        initialCommentCount={commentCount}
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
                <TouchableWithoutFeedback onPress={handleDoubleTap} accessibilityLabel="Double tap to like" accessibilityRole="button">
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
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityLabel="View full photo"
                  accessibilityRole="button"
                >
                  <Feather name="maximize-2" size={16} color="#FFF" />
                </TouchableOpacity>
              )}
              {onDeletePost && post.user_id === userId && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDeletePress}
                  activeOpacity={0.7}
                  accessibilityLabel="Delete post"
                  accessibilityRole="button"
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
                  accessibilityLabel={`View ${displayName}'s profile`}
                  accessibilityRole="button"
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
                accessibilityLabel={`View ${venueName} on map`}
                accessibilityRole="button"
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
              {(() => {
                const cat = getCategoryByKey(post.category ?? 'misc');
                if (!cat) return null;
                return (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: cat.color + '15',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 10,
                      alignSelf: 'flex-start',
                      marginTop: 4,
                    }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: cat.color,
                        marginRight: 4,
                      }}
                    />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: cat.color }}>{cat.label}</Text>
                  </View>
                );
              })()}
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
              <Pressable style={styles.commentButton} onPress={onCommentPress} accessibilityLabel="View comments" accessibilityRole="button">
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
