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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { PostWithProfile } from '../types';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import { SmoothImage } from './SmoothImage';
import { ReactionBar } from './ReactionBar';
import { CommentSheet } from './CommentSheet';
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

const SWIPE_THRESHOLD = 120;
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

function CardImage({
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
      Animated.sequence([
        Animated.spring(heartScale, {
          toValue: 1.2,
          useNativeDriver: true,
          speed: 50,
          bounciness: 8,
        }),
        Animated.spring(heartScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 50,
          bounciness: 6,
        }),
        Animated.delay(400),
        Animated.timing(heartOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setHeartVisible(false);
        heartScale.setValue(0);
        heartOpacity.setValue(1);
      });
    }
    lastTap.current = now;
  }, [onDoubleTap, heartScale, heartOpacity]);

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
      <SmoothImage
        source={{ uri: post.image_url }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onError={() => setImageError((prev) => ({ ...prev, [post.id]: true }))}
      />
      {heartVisible && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { justifyContent: 'center', alignItems: 'center' },
            { opacity: heartOpacity, transform: [{ scale: heartScale }] },
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
}

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
  const safeInitial = Math.min(
    Math.max(0, initialIndex ?? 0),
    Math.max(0, posts.length - 1)
  );
  const [currentIndex, setCurrentIndex] = useState(safeInitial);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [imageError, setImageError] = useState<Record<string, boolean>>({});
  const translateX = useRef(new Animated.Value(0)).current;
  const secondTranslateY = useRef(new Animated.Value(8)).current;
  const secondScale = useRef(new Animated.Value(0.97)).current;
  const secondOpacity = useRef(new Animated.Value(0.9)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(80)).current;
  const cardScale = useRef(new Animated.Value(0.9)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const gestureModeRef = useRef<'horizontal' | 'dismiss' | null>(null);
  const currentIndexRef = useRef(0);
  const postsLengthRef = useRef(0);
  const postsRef = useRef<PostWithProfile[]>([]);
  const flippedByPostIdRef = useRef<Record<string, boolean>>({});
  const swipeHapticFired = useRef(false);
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

  const handleDoubleTapHeart = useCallback(
    async () => {
      const post = posts[currentIndex];
      const userId = session?.user?.id;
      if (!post?.id || !userId || userReaction === '❤️') return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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

      if (prevReaction) {
        await supabase.from('reactions').delete().eq('post_id', post.id).eq('user_id', userId);
      }
      const { error } = await supabase.from('reactions').insert({
        post_id: post.id,
        user_id: userId,
        emoji: '❤️',
      });
      if (error) {
        setUserReaction(prevReaction);
        setReactionCounts(prevCounts);
        return;
      }
      if (post.user_id !== userId) {
        await supabase.from('notifications').insert({
          user_id: post.user_id,
          type: 'reaction',
          from_user_id: userId,
          post_id: post.id,
          emoji: '❤️',
        });
      }
    },
    [currentIndex, posts, session?.user?.id, userReaction, reactionCounts]
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
        console.log('[CardStack] Reaction notification check:', {
          postUserId: post.user_id,
          currentUserId: userId,
          shouldNotify,
        });
        if (shouldNotify) {
          console.log('About to create notification for reaction');
          const { data, error } = await supabase.from('notifications').insert({
            user_id: post.user_id,
            type: 'reaction',
            from_user_id: userId,
            post_id: post.id,
            emoji,
          }).select();
          console.log('Notification result:', { data, error });
        }
      }
    },
    [currentIndex, posts, session?.user?.id, userReaction, reactionCounts]
  );

  const handleFlippedChange = useCallback((postId: string, flipped: boolean) => {
    flippedByPostIdRef.current[postId] = flipped;
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const currentPost = postsRef.current[currentIndexRef.current];
        if (currentPost && flippedByPostIdRef.current[currentPost.id]) return false;
        const { dx, dy } = gestureState;
        if (dy > 10 && Math.abs(dy) > Math.abs(dx)) {
          gestureModeRef.current = 'dismiss';
          return true;
        }
        if (Math.abs(dx) > 5 && Math.abs(dx) > Math.abs(dy)) {
          gestureModeRef.current = 'horizontal';
          return true;
        }
        return false;
      },
      onPanResponderMove: (_evt, gestureState) => {
        const mode = gestureModeRef.current;
        if (mode === 'dismiss') {
          const { dy } = gestureState;
          if (dy > 0) panY.setValue(dy);
        } else if (mode === 'horizontal') {
          const { dx } = gestureState;
          translateX.setValue(dx);
          if (Math.abs(dx) > SWIPE_THRESHOLD && !swipeHapticFired.current) {
            swipeHapticFired.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const mode = gestureModeRef.current;
        gestureModeRef.current = null;
        if (mode === 'dismiss') {
          const { dy, vy } = gestureState;
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
        swipeHapticFired.current = false;
        const dx = gestureState.dx;
        if (Math.abs(dx) > SWIPE_THRESHOLD) {
          const toValue = dx > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH;
          const len = postsLengthRef.current;
          if (len === 0) return;
          let next: number;
          if (dx > 0) {
            next = currentIndexRef.current === 0 ? len - 1 : currentIndexRef.current - 1;
          } else {
            next = currentIndexRef.current === len - 1 ? 0 : currentIndexRef.current + 1;
          }
          Animated.parallel([
            Animated.timing(translateX, {
              toValue,
              duration: 220,
              useNativeDriver: true,
            }),
            Animated.spring(secondTranslateY, {
              toValue: 0,
              useNativeDriver: true,
              tension: 80,
              friction: 12,
            }),
            Animated.spring(secondScale, {
              toValue: 1,
              useNativeDriver: true,
              tension: 80,
              friction: 12,
            }),
            Animated.spring(secondOpacity, {
              toValue: 1,
              useNativeDriver: true,
              tension: 80,
              friction: 12,
            }),
          ]).start(() => {
            secondTranslateY.setValue(8);
            secondScale.setValue(0.97);
            secondOpacity.setValue(0.9);
            translateX.setValue(0); // Reset before setCurrentIndex to prevent flash
            setCurrentIndex(next);
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  if (posts.length === 0) return null;

  const len = posts.length;
  const getWrappedIndex = (offset: number) => ((currentIndex + offset) % len + len) % len;

  const nextIndex = getWrappedIndex(1);
  const nextNextIndex = getWrappedIndex(2);

  const currentPost = posts[currentIndex];
  const nextPost = posts[nextIndex];
  const nextNextPost = posts[nextNextIndex];

  const rotate = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });
  const swipeOpacity = translateX.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    outputRange: [0.7, 1, 0.7],
    extrapolate: 'clamp',
  });

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
              onDoubleTap={isCurrent ? handleDoubleTapHeart : undefined}
            />
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
        <View style={[styles.stackCard, styles.stackCardThird]}>
          {renderCard(nextNextPost, false)}
        </View>
        <Animated.View
          style={[
            styles.stackCard,
            styles.stackCardSecond,
            {
              transform: [
                { scale: secondScale },
                { translateY: secondTranslateY },
              ],
              opacity: secondOpacity,
            },
          ]}
        >
          {renderCard(nextPost, false)}
        </Animated.View>
        <Animated.View
          style={[
            styles.stackCard,
            styles.stackCardTop,
            {
              transform: [
                { translateX },
                { rotate },
              ],
              opacity: swipeOpacity,
            },
          ]}
        >
          {renderCard(currentPost, true)}
        </Animated.View>
      </Animated.View>

      <Text style={styles.indicator}>
        {currentIndex + 1} of {posts.length}
      </Text>
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
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
});
