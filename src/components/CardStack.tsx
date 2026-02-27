import React, { useState, useRef, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { PostWithProfile } from '../types';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';
import { ReactionBar } from './ReactionBar';
import { CommentSheet } from './CommentSheet';
import { PhotoViewer } from './PhotoViewer';
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
        <TouchableWithoutFeedback onPress={handleDoubleTap}>{imageContent}</TouchableWithoutFeedback>
      ) : (
        imageContent
      )}
    </View>
  );
}, (prev, next) => prev.post.id === next.post.id && prev.imageError[prev.post.id] === next.imageError[next.post.id]);

export function CardStack({
  posts,
  onClose,
  initialIndex,
  initialFlippedPostId,
  onInitialFlippedConsumed,
  onPostDeleted,
  onProfilePress,
}: CardStackProps) {
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
  const panY = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const endMessageOpacity = useRef(new Animated.Value(0)).current;
  const activeDotAnimated = useRef(new Animated.Value(safeInitial)).current;
  const gestureModeRef = useRef<'horizontal' | 'dismiss' | null>(null);
  const currentIndexRef = useRef(0);
  const postsLengthRef = useRef(0);
  const postsRef = useRef<PostWithProfile[]>([]);
  const flippedByPostIdRef = useRef<Record<string, boolean>>({});
  currentIndexRef.current = currentIndex;
  postsLengthRef.current = posts.length;
  postsRef.current = posts;

  useEffect(() => {
    // Reset all values when card stack opens (in case it was previously closed)
    overlayOpacity.setValue(0);
    cardTranslateY.setValue(80);
    cardScale.setValue(0.9);
    cardOpacity.setValue(0);
    panY.setValue(0);

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
                await supabase.storage.from('posts').remove([imagePath]);
              }
              await supabase.from('posts').delete().eq('id', post.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onPostDeleted?.(post.id);
              if (posts.length <= 1) {
                onClose();
              }
            } catch (err) {
              console.error('Error deleting post:', err);
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
      const userId = session?.user?.id;
      const { data, error } = await supabase
        .from('reactions')
        .select('*')
        .eq('post_id', postId);
      if (error) {
        console.error('Error fetching reactions:', error);
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

  useEffect(() => {
    if (posts?.length > 0) {
      posts.forEach((post) => {
        if (post?.image_url) {
          Image.prefetch(post.image_url).catch(() => {});
        }
      });
    }
  }, [posts]);

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

      // Delete old reaction if exists
      if (existingReactions) {
        await supabase.from('reactions').delete().eq('post_id', post.id).eq('user_id', userId);
      }

      // Insert heart reaction
      const { error } = await supabase.from('reactions').insert({
        post_id: post.id,
        user_id: userId,
        emoji: '❤️',
      });

      if (error) {
        console.error('Double tap heart error:', error);
        setUserReaction(prevReaction);
        setReactionCounts(prevCounts);
        return;
      }

      // Send notification
      if (post.user_id !== userId) {
        await supabase
          .from('notifications')
          .insert({
            user_id: post.user_id,
            type: 'reaction',
            from_user_id: userId,
            post_id: post.id,
            emoji: '❤️',
          })
          .select();
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
        setReactionCounts((c) => ({
          ...c,
          [emoji]: Math.max(0, (c[emoji] ?? 1) - 1),
        }));
      } else {
        setUserReaction(emoji);
        setReactionCounts((c) => {
          const next = { ...c };
          if (prevReaction) {
            next[prevReaction] = Math.max(0, (next[prevReaction] ?? 1) - 1);
          }
          next[emoji] = (next[emoji] ?? 0) + 1;
          return next;
        });
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
          console.error('Error deleting reaction:', error);
          return;
        }
      } else {
        if (prevReaction) {
          await supabase.from('reactions').delete().eq('post_id', post.id).eq('user_id', userId);
        }
        const { error } = await supabase.from('reactions').insert({
          post_id: post.id,
          user_id: userId,
          emoji,
        });
        if (error) {
          setUserReaction(prevReaction);
          setReactionCounts(prevCounts);
          console.error('Error inserting reaction:', error);
          return;
        }
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
        if (dy > 10 && Math.abs(dy) > Math.abs(dx)) {
          gestureModeRef.current = 'dismiss';
          return true;
        }
        if (postsLengthRef.current > 1 && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          gestureModeRef.current = 'horizontal';
          return true;
        }
        return false;
      },
      onPanResponderMove: (_, gesture) => {
        const mode = gestureModeRef.current;
        if (mode === 'dismiss') {
          if (gesture.dy > 0) panY.setValue(gesture.dy);
        } else if (mode === 'horizontal') {
          pan.setValue(gesture.dx);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        const mode = gestureModeRef.current;
        gestureModeRef.current = null;
        if (mode === 'dismiss') {
          const { dy, vy } = gesture;
          if (dy > 150 || vy > 0.5) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Animated.timing(panY, {
              toValue: SCREEN_HEIGHT,
              duration: 250,
              useNativeDriver: true,
            }).start(() => {
              panY.setValue(0);
              onClose();
            });
          } else {
            Animated.spring(panY, {
              toValue: 0,
              friction: 8,
              tension: 80,
              useNativeDriver: true,
            }).start();
          }
          return;
        }
        const len = postsLengthRef.current;
        if (len === 0) return;
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
            setShowEndMessage(true);
            endMessageOpacity.setValue(1);
            setTimeout(() => {
              Animated.timing(endMessageOpacity, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
              }).start(() => setShowEndMessage(false));
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

  const renderCard = (post: PostWithProfile, isCurrent: boolean) => (
    <CommentSheet
      key={post.id}
      postId={post.id}
      post={{ image_url: post.image_url, venue_name: post.venue_name }}
      postUserId={post.user_id}
      userId={session?.user?.id}
      cardHeight={CARD_HEIGHT}
      cardWidth={CARD_WIDTH}
      cardBorderRadius={CARD_BORDER_RADIUS}
      onFlippedChange={handleFlippedChange}
      initialFlipped={post.id === initialFlippedPostId}
    >
      {({ onCommentPress, commentCount }) => (
        <View style={styles.cardFront}>
          <View style={styles.photoSection}>
            <CardImage
              post={post}
              imageError={imageError}
              setImageError={setImageError}
              s={{
                cardImageWrap: styles.cardImageWrap,
                cardImage: styles.cardImage,
                cardImagePlaceholder: styles.cardImagePlaceholder,
                cardImageErrorText: styles.cardImageErrorText,
              }}
              onDoubleTap={() => handleDoubleTapHeartForPost(post)}
            />
            {!imageError[post.id] && (
              <TouchableOpacity
                style={styles.expandButton}
                onPress={() => setViewerImage(post.image_url)}
                activeOpacity={0.7}
              >
                <Feather name="maximize-2" size={18} color="#FFF" />
              </TouchableOpacity>
            )}
            {post.user_id === currentUserId && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeletePost(post)}
                activeOpacity={0.7}
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
              >
                <Text style={styles.infoDisplayName} numberOfLines={1}>
                  {post.profiles?.display_name ?? 'Unknown'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.infoDisplayName} numberOfLines={1}>
                {post.user_id === currentUserId ? 'You' : (post.profiles?.display_name ?? 'Unknown')}
              </Text>
            )}
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
            <Pressable style={styles.commentButton} onPress={onCommentPress}>
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
  );

  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          styles.overlayBg,
          {
            opacity: Animated.multiply(
              overlayOpacity,
              panY.interpolate({
                inputRange: [0, 300],
                outputRange: [1, 0.5],
                extrapolate: 'clamp',
              })
            ),
          },
        ]}
        pointerEvents="none"
      />
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleClose}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        activeOpacity={0.7}
      >
        <Feather name="x" size={22} color={theme.colors.text} />
      </TouchableOpacity>

      <Animated.View
        style={[
          styles.stackContainer,
          {
            transform: [
              { translateY: Animated.add(cardTranslateY, panY) },
              {
                scale: Animated.multiply(
                  cardScale,
                  panY.interpolate({
                    inputRange: [0, 300],
                    outputRange: [1, 0.92],
                    extrapolate: 'clamp',
                  })
                ),
              },
            ],
            opacity: cardOpacity,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.dragHandle}>
          <View style={styles.dragHandleBar} />
        </View>
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
    shadowColor: '#000',
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
  dragHandle: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  dragHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.textTertiary,
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
  stackCardThird: {
    zIndex: 1,
    transform: [{ scale: 0.94 }, { translateY: 16 }],
    opacity: 0.8,
  },
  stackCardSecond: {
    zIndex: 2,
  },
  stackCardTop: {
    zIndex: 3,
    transform: [{ translateY: 0 }],
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    bottom: 48,
    fontSize: theme.fontSize.xs,
    fontWeight: '400',
    color: theme.colors.textTertiary,
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
