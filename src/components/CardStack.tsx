/**
 * CardStack.tsx
 *
 * NOTE: This file is over 1200 lines. Future refactoring candidates:
 * - Extract useReactions hook (fetchReactions, handleDoubleTapHeart, handleReactionToggle, optimistic updates)
 * - Extract CardImage component (image loading, double-tap heart animation, error state)
 * - Extract DotIndicator component (pagination dots with active state)
 * - Extract useCardStackAnimations hook (entry/close animations, pan responder, shake animation)
 * - Move SWIPE_THRESHOLD, VELOCITY_THRESHOLD, and card dimension constants to lib/cardConstants.ts
 *
 * Swipeable card stack overlay for viewing posts (from map clusters or profile gallery).
 *
 * Key responsibilities:
 * - Renders posts as full-screen cards with pan gesture (swipe left/right to navigate)
 * - Each card shows photo, caption, venue, reactions, and flip-to-comments (CommentSheet)
 * - Double-tap heart animation, expand photo, delete (own posts)
 * - Entry animation (slide up + fade), dot indicator for position
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { PostWithProfile } from '../types';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { shouldSendNotification } from '../lib/notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';
import { ReactionBar } from './ReactionBar';
import { CommentSheet } from './CommentSheet';
import { PhotoViewer } from './PhotoViewer';
import { timeAgo } from '../lib/timeAgo';
import { getCategoryByKey } from '../lib/categories';
import { TaggedLine } from './TaggedLine';
/** Props for CardStack - posts to show, callbacks, optional initial state */
type CardStackProps = {
  posts: PostWithProfile[];
  onClose: () => void;
  initialIndex?: number;
  /** When set, the card for this post starts flipped to comments */
  initialFlippedPostId?: string;
  onInitialFlippedConsumed?: () => void;
  onPostDeleted?: (postId: string) => void;
  onProfilePress?: (userId: string) => void;
};

/** Dot pagination indicator - shows up to 7 dots, animates active position */
function DotIndicator({
  total,
  current,
  activeDotAnimated,
}: {
  total: number;
  current: number;
  activeDotAnimated: Animated.Value;
}) {
  if (total <= 1) return null;

  const dotCount = Math.min(total, 7);
  const startIndex = total > 7 ? Math.max(0, Math.min(current - 3, total - 7)) : 0;
  const activeDotIndex = total > 7 ? current - startIndex : current;

  return (
    <View style={styles.dotIndicatorRow}>
      {Array.from({ length: dotCount }).map((_, i) => {
        const dotScale = activeDotAnimated.interpolate({
          inputRange: [i - 0.5, i, i + 0.5],
          outputRange: [0.7, 1, 0.7],
          extrapolate: 'clamp',
        });
        const dotOpacity = activeDotAnimated.interpolate({
          inputRange: [i - 0.5, i, i + 0.5],
          outputRange: [0.4, 1, 0.4],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.dotIndicatorDot,
              {
                transform: [{ scale: dotScale }],
                opacity: dotOpacity,
                backgroundColor: theme.colors.primary,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/** Horizontal swipe distance (px) to trigger next/prev card */
const SWIPE_THRESHOLD = 80;
const BOTTOM_BAR_HEIGHT = 50;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.9;
/** Card height fits within screen: photo flexes, info compact, bar fixed 50px */
const CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.75, CARD_WIDTH * 1.5);
const CARD_BORDER_RADIUS = 20;

type CardImageStyles = {
  cardImageWrap: object;
  cardImage: object;
  cardImagePlaceholder: object;
  cardImageErrorText: object;
};

const CardImage = React.memo(function CardImage({
  post,
  imageError,
  setImageError,
  s,
  onDoubleTap,
}: {
  post: PostWithProfile;
  imageError: Record<string, boolean>;
  setImageError: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  s: CardImageStyles;
  onDoubleTap?: () => void;
}) {
  const failed = imageError[post.id];
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(1)).current;
  const heartTranslateY = useRef(new Animated.Value(0)).current;
  const heartRotate = useRef(new Animated.Value(0)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const [heartVisible, setHeartVisible] = useState(false);

  const handleDoubleTap = useCallback(() => {
    if (!onDoubleTap) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      onDoubleTap();
      setHeartVisible(true);
      heartScale.setValue(0);
      heartOpacity.setValue(1);
      heartTranslateY.setValue(0);
      heartRotate.setValue(0);
      flashOpacity.setValue(0.3);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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
    }
    lastTap.current = now;
  }, [onDoubleTap, heartScale, heartOpacity, heartTranslateY, heartRotate, flashOpacity]);

  if (failed) {
    return (
      <View style={[s.cardImage, s.cardImagePlaceholder]}>
        <Feather name="image" size={24} color={theme.colors.textTertiary} />
        <Text style={s.cardImageErrorText}>Image unavailable</Text>
      </View>
    );
  }
  const imageContent = (
    <View style={s.cardImage}>
      <Image
        source={{ uri: post.image_url }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onError={() => setImageError((prev) => ({ ...prev, [post.id]: true }))}
      />
      {/* White screen flash */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.colors.white,
            opacity: flashOpacity,
          },
        ]}
      />
      {/* Heart emoji */}
      {heartVisible && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { justifyContent: 'center', alignItems: 'center' },
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
          <Text style={styles.cardHeartEmoji}>❤️</Text>
        </Animated.View>
      )}
    </View>
  );

  return (
    <View style={s.cardImageWrap}>
      {onDoubleTap ? (
        <TouchableWithoutFeedback onPress={handleDoubleTap} accessibilityLabel="Double tap to like" accessibilityRole="button">{imageContent}</TouchableWithoutFeedback>
      ) : (
        imageContent
      )}
    </View>
  );
}, (prev, next) => prev.post.id === next.post.id && prev.imageError[prev.post.id] === next.imageError[next.post.id]);

/**
 * CardStack
 *
 * Swipeable overlay for viewing posts. Opened from map clusters or profile gallery.
 *
 * @param posts - Posts to display
 * @param onClose - Called when user closes the stack
 * @param initialIndex - Starting card index
 * @param initialFlippedPostId - If set, that card starts flipped to comments
 * @param onPostDeleted - Called when user deletes a post
 * @param onProfilePress - Called when user taps a tagged profile
 */
export function CardStack({
  posts,
  onClose,
  initialIndex,
  initialFlippedPostId,
  onInitialFlippedConsumed,
  onPostDeleted,
  onProfilePress,
}: CardStackProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const cardWidth = screenWidth * 0.9;
  const cardHeight = Math.min(screenHeight * 0.75, cardWidth * 1.5);
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const safeInitial = Math.min(
    Math.max(0, initialIndex ?? 0),
    Math.max(0, posts.length - 1)
  );
  const [currentIndex, setCurrentIndex] = useState(safeInitial);
  const [showEndMessage, setShowEndMessage] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [imageError, setImageError] = useState<Record<string, boolean>>({});
  const pan = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(80)).current;
  const cardScale = useRef(new Animated.Value(0.9)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const endMessageOpacity = useRef(new Animated.Value(0)).current;
  const activeDotAnimated = useRef(new Animated.Value(safeInitial)).current;
  const currentIndexRef = useRef(0);
  const postsLengthRef = useRef(0);
  const postsRef = useRef<PostWithProfile[]>([]);
  const flippedByPostIdRef = useRef<Record<string, boolean>>({});
  const reactionsCache = useRef<Record<string, { counts: Record<string, number>; userReaction: string | null }>>({});
  const endMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  currentIndexRef.current = currentIndex;
  postsLengthRef.current = posts.length;
  postsRef.current = posts;

  // Apply initialIndex once when stack opens so swipe starts at the tapped post
  const hasAppliedInitialRef = useRef(false);
  useEffect(() => {
    if (hasAppliedInitialRef.current || posts.length === 0) return;
    hasAppliedInitialRef.current = true;
    const safe = Math.min(
      Math.max(0, initialIndex ?? 0),
      Math.max(0, posts.length - 1)
    );
    setCurrentIndex(safe);
  }, [posts.length, initialIndex]);

  useEffect(() => {
    // Reset all values when card stack opens (in case it was previously closed)
    overlayOpacity.setValue(0);
    cardTranslateY.setValue(80);
    cardScale.setValue(0.9);
    cardOpacity.setValue(0);

    Animated.parallel([
      // Overlay fade in
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      // Card slide up + scale + fade — with 50ms delay
      Animated.sequence([
        Animated.delay(50),
        Animated.parallel([
          Animated.spring(cardTranslateY, {
            toValue: 0,
            friction: 7,
            tension: 60,
            useNativeDriver: true,
          }),
          Animated.spring(cardScale, {
            toValue: 1,
            friction: 7,
            tension: 60,
            useNativeDriver: true,
          }),
          Animated.timing(cardOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [overlayOpacity, cardTranslateY, cardScale, cardOpacity]);

  useEffect(() => {
    return () => {
      if (endMessageTimerRef.current) {
        clearTimeout(endMessageTimerRef.current);
        endMessageTimerRef.current = null;
      }
    };
  }, []);

  const handleDeletePost = useCallback(
    async (post: PostWithProfile) => {
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
              onPostDeleted?.(post.id);
              if (posts.length <= 1) {
                onClose();
              }
            } catch (err) {
              if (__DEV__) console.error('Error deleting post:', err);
              Alert.alert('Error', 'Could not delete post. Please try again.');
            }
          },
        },
      ]);
    },
    [onPostDeleted, onClose, posts.length]
  );

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(cardTranslateY, { toValue: 80, duration: 200, useNativeDriver: true }),
      Animated.timing(cardScale, { toValue: 0.9, duration: 200, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  }, [onClose, overlayOpacity, cardTranslateY, cardScale, cardOpacity]);

  const fetchReactions = useCallback(
    async (postId: string) => {
      const cached = reactionsCache.current[postId];
      if (cached) {
        setReactionCounts(cached.counts);
        setUserReaction(cached.userReaction);
        return;
      }
      const userId = session?.user?.id;
      const { data, error } = await supabase
        .from('reactions')
        .select('emoji, user_id')
        .eq('post_id', postId)
        .limit(200);
      if (error) {
        if (__DEV__) console.error('Error fetching reactions:', error);
        return;
      }
      const counts: Record<string, number> = {};
      let myReaction: string | null = null;
      for (const row of data ?? []) {
        const emoji = row.emoji as string;
        counts[emoji] = (counts[emoji] ?? 0) + 1;
        if (row.user_id === userId) {
          myReaction = emoji;
        }
      }
      reactionsCache.current[postId] = { counts, userReaction: myReaction };
      setReactionCounts(counts);
      setUserReaction(myReaction);
    },
    [session?.user?.id]
  );

  useEffect(() => {
    const post = posts[currentIndex];
    if (post?.id) {
      fetchReactions(post.id);
    } else {
      setReactionCounts({});
      setUserReaction(null);
    }
  }, [currentIndex, posts, fetchReactions]);

  useEffect(() => {
    if (posts.length === 0) {
      flippedByPostIdRef.current = {};
      onClose();
      return;
    }
    setCurrentIndex((prev) => Math.min(prev, posts.length - 1));
  }, [posts.length, onClose]);

  useEffect(() => {
    if (initialFlippedPostId) {
      onInitialFlippedConsumed?.();
    }
  }, [initialFlippedPostId, onInitialFlippedConsumed]);

  /**
   * Prefetch images for nearby cards only (current ± 3).
   * Avoids loading 50+ images into memory for large stacks.
   * Re-runs when currentIndex changes to prefetch ahead.
   */
  useEffect(() => {
    const start = Math.max(0, currentIndex - 1);
    const end = Math.min(posts.length - 1, currentIndex + 3);

    for (let i = start; i <= end; i++) {
      const url = posts[i]?.image_url;
      if (url) Image.prefetch(url).catch(() => {});
    }
  }, [currentIndex, posts]);

  useEffect(() => {
    const len = posts.length;
    if (len <= 1) return;
    const dotCount = Math.min(7, len);
    const startIndex = len > 7 ? Math.max(0, Math.min(currentIndex - 3, len - 7)) : 0;
    const activePosition = len <= 7 ? currentIndex : currentIndex - startIndex;
    const clampedActive = Math.max(0, Math.min(activePosition, dotCount - 1));
    Animated.spring(activeDotAnimated, {
      toValue: clampedActive,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [currentIndex, posts.length, activeDotAnimated]);

  const handleDoubleTapHeartForPost = useCallback(
    async (post: PostWithProfile) => {
      const userId = session?.user?.id;
      if (!post?.id || !userId) return;

      // Always fetch fresh reaction state for this post
      const { data: existingReactions } = await supabase
        .from('reactions')
        .select('emoji')
        .eq('post_id', post.id)
        .eq('user_id', userId)
        .single();

      // If already hearted, skip
      if (existingReactions?.emoji === '❤️') return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Optimistic update
      const prevReaction = userReaction;
      const prevCounts = { ...reactionCounts };
      setUserReaction('❤️');
      setReactionCounts((c) => {
        const next = { ...c };
        if (prevReaction) {
          next[prevReaction] = Math.max(0, (next[prevReaction] ?? 1) - 1);
        }
        next['❤️'] = (next['❤️'] ?? 0) + 1;
        return next;
      });

      // Delete old notification if changing from another emoji
      if (existingReactions) {
        await supabase
          .from('notifications')
          .delete()
          .eq('from_user_id', userId)
          .eq('post_id', post.id)
          .eq('type', 'reaction');
      }

      // Upsert heart reaction (handles both new and changed)
      const { error } = await supabase
        .from('reactions')
        .upsert({ post_id: post.id, user_id: userId, emoji: '❤️' }, { onConflict: 'post_id,user_id' });

      if (error) {
        if (__DEV__) console.error('Double tap heart error:', error);
        setUserReaction(prevReaction);
        setReactionCounts(prevCounts);
        return;
      }
      const newCounts = { ...prevCounts };
      if (prevReaction) {
        newCounts[prevReaction] = Math.max(0, (newCounts[prevReaction] ?? 1) - 1);
      }
      newCounts['❤️'] = (newCounts['❤️'] ?? 0) + 1;
      reactionsCache.current[post.id] = { counts: newCounts, userReaction: '❤️' };

      // Send notification (best-effort, don't block UI)
      if (post.user_id !== userId) {
        try {
          const ok = await shouldSendNotification(post.user_id, 'reaction');
          if (ok) {
            await supabase.from('notifications').insert({
              user_id: post.user_id,
              type: 'reaction',
              from_user_id: userId,
              post_id: post.id,
              emoji: '❤️',
            });
          }
        } catch (notifErr) {
          if (__DEV__) console.error('Notification insert failed:', notifErr);
        }
      }
    },
    [session?.user?.id, userReaction, reactionCounts]
  );

  const handleReactionToggle = useCallback(
    async (emoji: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const post = posts[currentIndex];
      const userId = session?.user?.id;
      if (!post?.id || !userId) return;

      const prevReaction = userReaction;
      const prevCounts = { ...reactionCounts };

        if (prevReaction === emoji) {
        setUserReaction(null);
        const nextCounts = { ...prevCounts, [emoji]: Math.max(0, (prevCounts[emoji] ?? 1) - 1) };
        setReactionCounts(nextCounts);
      } else {
        setUserReaction(emoji);
        const nextCounts = { ...prevCounts };
        if (prevReaction) {
          nextCounts[prevReaction] = Math.max(0, (nextCounts[prevReaction] ?? 1) - 1);
        }
        nextCounts[emoji] = (nextCounts[emoji] ?? 0) + 1;
        setReactionCounts(nextCounts);
      }

      if (prevReaction === emoji) {
        const { error } = await supabase
          .from('reactions')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', userId);
        if (error) {
          setUserReaction(prevReaction);
          setReactionCounts(prevCounts);
          if (__DEV__) console.error('Error deleting reaction:', error);
          Alert.alert('Error', 'Could not remove reaction. Please try again.');
          return;
        }
        await supabase
          .from('notifications')
          .delete()
          .eq('from_user_id', userId)
          .eq('post_id', post.id)
          .eq('type', 'reaction');
        const nextCounts = { ...prevCounts, [emoji]: Math.max(0, (prevCounts[emoji] ?? 1) - 1) };
        reactionsCache.current[post.id] = { counts: nextCounts, userReaction: null };
      } else {
        if (prevReaction) {
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
        if (error) {
          setUserReaction(prevReaction);
          setReactionCounts(prevCounts);
          if (__DEV__) console.error('Error inserting reaction:', error);
          Alert.alert('Error', 'Could not save reaction. Please try again.');
          return;
        }
        const nextCounts = { ...prevCounts };
        if (prevReaction) {
          nextCounts[prevReaction] = Math.max(0, (nextCounts[prevReaction] ?? 1) - 1);
        }
        nextCounts[emoji] = (nextCounts[emoji] ?? 0) + 1;
        reactionsCache.current[post.id] = { counts: nextCounts, userReaction: emoji };
        const shouldNotify = post.user_id !== userId;
        if (shouldNotify) {
          try {
            const ok = await shouldSendNotification(post.user_id, 'reaction');
            if (ok) {
              await supabase.from('notifications').insert({
                user_id: post.user_id,
                type: 'reaction',
                from_user_id: userId,
                post_id: post.id,
                emoji,
              });
            }
          } catch (notifErr) {
            if (__DEV__) console.error('Notification insert failed:', notifErr);
          }
        }
      }
    },
    [currentIndex, posts, session?.user?.id, userReaction, reactionCounts]
  );

  const handleFlippedChange = useCallback((postId: string, flipped: boolean) => {
    flippedByPostIdRef.current[postId] = flipped;
  }, []);

  const triggerShake = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const VELOCITY_THRESHOLD = 0.3;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        const currentPost = postsRef.current[currentIndexRef.current];
        if (currentPost && flippedByPostIdRef.current[currentPost.id]) return false;
        const { dx, dy } = gesture;
        if (postsLengthRef.current > 1 && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          return true;
        }
        return false;
      },
      onPanResponderMove: (_, gesture) => {
        pan.setValue(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        const len = postsLengthRef.current;
        if (len === 0 || len <= 1) return;
        const isFirst = currentIndexRef.current === 0;
        const isLast = currentIndexRef.current === len - 1;
        const swipedLeft = gesture.dx < -SWIPE_THRESHOLD || gesture.vx < -VELOCITY_THRESHOLD;
        const swipedRight = gesture.dx > SWIPE_THRESHOLD || gesture.vx > VELOCITY_THRESHOLD;

        if (swipedLeft && !isLast) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.timing(pan, {
            toValue: -400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setCurrentIndex((prev) => prev + 1);
            pan.setValue(0);
          });
        } else if (swipedRight && !isFirst) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.timing(pan, {
            toValue: 400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setCurrentIndex((prev) => prev - 1);
            pan.setValue(0);
          });
        } else if ((swipedLeft && isLast) || (swipedRight && isFirst)) {
          triggerShake();
          if (swipedLeft && isLast) {
            if (endMessageTimerRef.current) clearTimeout(endMessageTimerRef.current);
            setShowEndMessage(true);
            endMessageOpacity.setValue(1);
            endMessageTimerRef.current = setTimeout(() => {
              Animated.timing(endMessageOpacity, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
              }).start(() => setShowEndMessage(false));
              endMessageTimerRef.current = null;
            }, 1500);
          }
          Animated.spring(pan, {
            toValue: 0,
            friction: 8,
            tension: 100,
            useNativeDriver: true,
          }).start();
        } else {
          Animated.spring(pan, {
            toValue: 0,
            friction: 8,
            tension: 80,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (posts.length === 0) return null;

  const len = posts.length;
  const currentUserId = session?.user?.id;

  const cardImageStyles = useMemo(
    () => ({
      cardImageWrap: styles.cardImageWrap,
      cardImage: styles.cardImage,
      cardImagePlaceholder: styles.cardImagePlaceholder,
      cardImageErrorText: styles.cardImageErrorText,
    }),
    []
  );

  const renderCard = useCallback(
    (post: PostWithProfile, isCurrent: boolean) => (
    <CommentSheet
      key={post.id}
      postId={post.id}
      post={{ image_url: post.image_url, venue_name: post.venue_name }}
      postUserId={post.user_id}
      userId={session?.user?.id}
      cardHeight={cardHeight}
      cardWidth={cardWidth}
      cardBorderRadius={CARD_BORDER_RADIUS}
      onFlippedChange={handleFlippedChange}
      initialFlipped={post.id === initialFlippedPostId}
      initialCommentCount={post.comment_count ?? 0}
    >
      {({ onCommentPress, commentCount }) => (
        <View style={styles.cardFront}>
          <View style={styles.photoSection}>
            <CardImage
              post={post}
              imageError={imageError}
              setImageError={setImageError}
              s={cardImageStyles}
              onDoubleTap={() => handleDoubleTapHeartForPost(post)}
            />
            {!imageError[post.id] && (
              <TouchableOpacity
                style={styles.expandButton}
                onPress={() => setViewerImage(post.image_url)}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="View full photo"
                accessibilityRole="button"
              >
                <Feather name="maximize-2" size={18} color={theme.colors.white} />
              </TouchableOpacity>
            )}
            {post.user_id === currentUserId && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeletePost(post)}
                activeOpacity={0.7}
                accessibilityLabel="Delete post"
                accessibilityRole="button"
              >
                <Feather name="trash-2" size={16} color={theme.colors.red} />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.infoSection}>
            {onProfilePress && post.user_id !== currentUserId ? (
              <TouchableOpacity
                onPress={() => onProfilePress(post.user_id)}
                activeOpacity={0.7}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityLabel={`View ${post.profiles?.display_name ?? 'user'}'s profile`}
                accessibilityRole="button"
              >
                <Text style={styles.infoDisplayName} numberOfLines={1}>
                  {post.profiles?.display_name ?? 'Deleted User'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.infoDisplayName} numberOfLines={1}>
                {post.user_id === currentUserId ? 'You' : (post.profiles?.display_name ?? 'Deleted User')}
              </Text>
            )}
            <TaggedLine tags={post.post_tags} onProfilePress={onProfilePress} />
            <View style={styles.infoVenueRow}>
              <Feather name="map-pin" size={12} color={theme.colors.primary} />
              <Text style={styles.infoVenueText} numberOfLines={1}>
                {post.venue_name ?? 'Unknown location'}
              </Text>
            </View>
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
          {isCurrent && <DotIndicator total={len} current={currentIndex} activeDotAnimated={activeDotAnimated} />}
          <View style={styles.bottomBar}>
            <View style={styles.reactionsSection}>
              <ReactionBar
                counts={isCurrent ? reactionCounts : {}}
                userReaction={isCurrent ? userReaction : null}
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
                  <Text style={styles.commentCountText}>{commentCount}</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </CommentSheet>
  ),
  [
    imageError,
    cardImageStyles,
    handleDoubleTapHeartForPost,
    setViewerImage,
    currentUserId,
    handleDeletePost,
    onProfilePress,
    handleFlippedChange,
    initialFlippedPostId,
    reactionCounts,
    userReaction,
    handleReactionToggle,
    currentIndex,
    posts.length,
    activeDotAnimated,
    session?.user?.id,
  ]
);

  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          styles.overlayBg,
          { opacity: overlayOpacity },
        ]}
        pointerEvents="none"
      />
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleClose}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        activeOpacity={0.7}
        accessibilityLabel="Close"
        accessibilityRole="button"
      >
        <Feather name="x" size={22} color={theme.colors.text} />
      </TouchableOpacity>

      <Animated.View
        style={[
          styles.stackContainer,
          {
            transform: [
              { translateY: cardTranslateY },
              { scale: cardScale },
            ],
            opacity: cardOpacity,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.cardsWrapper}>
          {posts.map((post, index) => {
            if (Math.abs(index - currentIndex) > 1) return null;
            const isCurrent = index === currentIndex;
            return (
              <Animated.View
                key={post.id}
                style={[
                  styles.stackCard,
                  styles.stackCardTop,
                  {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: isCurrent ? 3 : 1,
                    opacity: isCurrent ? 1 : 0,
                    transform: isCurrent ? [{ translateX: Animated.add(pan, shakeAnim) }] : [],
                  },
                ]}
                pointerEvents={isCurrent ? 'auto' : 'none'}
              >
                {renderCard(post, isCurrent)}
              </Animated.View>
            );
          })}
        </View>
      </Animated.View>

      {showEndMessage && (
        <Animated.View
          style={[
            styles.endMessage,
            {
              bottom: 60 + (insets?.bottom ?? 0),
              opacity: endMessageOpacity,
            },
          ]}
        >
          <Text style={styles.endMessageText}>You've seen all posts here</Text>
        </Animated.View>
      )}

      {viewerImage && (
        <PhotoViewer
          imageUrl={viewerImage}
          onClose={() => setViewerImage(null)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayBg: {
    backgroundColor: theme.colors.overlay,
  },
  cardFront: {
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
  },
  photoSection: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    width: '100%',
  },
  infoSection: {
    padding: 12,
    flexShrink: 0,
    backgroundColor: theme.colors.cardBackground,
  },
  infoDisplayName: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
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
    backgroundColor: theme.colors.overlayDark,
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
    shadowColor: theme.colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: BOTTOM_BAR_HEIGHT,
    paddingHorizontal: 12,
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.cardBackground,
  },
  reactionsSection: {
    flex: 1,
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
  cardImageWrap: {
    ...StyleSheet.absoluteFillObject,
    position: 'absolute',
  },
  cardImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  cardImageErrorText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
  },
  cardHeartEmoji: {
    fontSize: 80,
    textShadowColor: 'rgba(255, 50, 50, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  cardsWrapper: {
    position: 'relative',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    overflow: 'hidden',
  },
  stackContainer: {
    position: 'relative',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackCard: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    maxHeight: CARD_HEIGHT,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: CARD_BORDER_RADIUS,
    overflow: 'hidden',
    borderWidth: 0,
    ...theme.shadows.card,
  },
  stackCardTop: {
    zIndex: 3,
    transform: [{ translateY: 0 }],
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  dotIndicatorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    flexShrink: 0,
  },
  dotIndicatorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginHorizontal: 3,
  },
  endMessage: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: theme.colors.text,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  endMessageText: {
    color: theme.colors.background,
    fontSize: 13,
    fontWeight: '500',
  },
});
