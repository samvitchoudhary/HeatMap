import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
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
import { Avatar } from './Avatar';

type CardStackProps = {
  posts: PostWithProfile[];
  onClose: () => void;
  initialIndex?: number;
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
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.68;
const IMAGE_HEIGHT = CARD_HEIGHT * 0.55;

type CardImageStyles = {
  cardImageWrap: object;
  cardImage: object;
  cardImagePlaceholder: object;
  cardImageErrorText: object;
};

function CardImage({
  post,
  imageLoaded,
  setImageLoaded,
  imageError,
  setImageError,
  s,
}: {
  post: PostWithProfile;
  imageLoaded: Record<string, boolean>;
  setImageLoaded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  imageError: Record<string, boolean>;
  setImageError: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  s: CardImageStyles;
}) {
  const loaded = imageLoaded[post.id];
  const failed = imageError[post.id];
  const imageOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (loaded) {
      Animated.timing(imageOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [loaded, imageOpacity]);
  if (failed) {
    return (
      <View style={[s.cardImage, s.cardImagePlaceholder]}>
        <Feather name="image" size={24} color={theme.colors.textTertiary} />
        <Text style={s.cardImageErrorText}>Image unavailable</Text>
      </View>
    );
  }
  return (
    <View style={s.cardImageWrap}>
      {!loaded && (
        <View style={StyleSheet.absoluteFill}>
          <Skeleton width="100%" height={IMAGE_HEIGHT} borderRadius={theme.borderRadius.lg} />
        </View>
      )}
      <Animated.View style={[s.cardImage, { opacity: imageOpacity }]}>
        <Image
          source={{ uri: post.image_url }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoad={() => setImageLoaded((prev) => ({ ...prev, [post.id]: true }))}
          onError={() => setImageError((prev) => ({ ...prev, [post.id]: true }))}
        />
      </Animated.View>
    </View>
  );
}

export function CardStack({ posts, onClose, initialIndex }: CardStackProps) {
  const { session } = useAuth();
  const safeInitial = Math.min(
    Math.max(0, initialIndex ?? 0),
    Math.max(0, posts.length - 1)
  );
  const [currentIndex, setCurrentIndex] = useState(safeInitial);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [userReactions, setUserReactions] = useState<Set<string>>(new Set());
  const [imageLoaded, setImageLoaded] = useState<Record<string, boolean>>({});
  const [imageError, setImageError] = useState<Record<string, boolean>>({});
  const translateX = useRef(new Animated.Value(0)).current;
  const secondTranslateY = useRef(new Animated.Value(8)).current;
  const secondScale = useRef(new Animated.Value(0.97)).current;
  const secondOpacity = useRef(new Animated.Value(0.9)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.95)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const currentIndexRef = useRef(0);
  const postsLengthRef = useRef(0);
  const swipeHapticFired = useRef(false);
  currentIndexRef.current = currentIndex;
  postsLengthRef.current = posts.length;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(cardScale, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [overlayOpacity, cardScale, cardOpacity]);

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(cardScale, { toValue: 0.95, duration: 200, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  }, [onClose, overlayOpacity, cardScale, cardOpacity]);

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
      const userSet = new Set<string>();
      for (const row of data ?? []) {
        const emoji = row.emoji as string;
        counts[emoji] = (counts[emoji] ?? 0) + 1;
        if (row.user_id === userId) {
          userSet.add(emoji);
        }
      }
      setReactionCounts(counts);
      setUserReactions(userSet);
    },
    [session?.user?.id]
  );

  useEffect(() => {
    const post = posts[currentIndex];
    if (post?.id) {
      fetchReactions(post.id);
    } else {
      setReactionCounts({});
      setUserReactions(new Set());
    }
  }, [currentIndex, posts, fetchReactions]);

  const handleReactionToggle = useCallback(
    async (emoji: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const post = posts[currentIndex];
      const userId = session?.user?.id;
      if (!post?.id || !userId) return;

      const alreadyReacted = userReactions.has(emoji);
      if (alreadyReacted) {
        const { error } = await supabase
          .from('reactions')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', userId)
          .eq('emoji', emoji);
        if (error) {
          console.error('Error deleting reaction:', error);
          return;
        }
      } else {
        const { error } = await supabase.from('reactions').insert({
          post_id: post.id,
          user_id: userId,
          emoji,
        });
        if (error) {
          console.error('Error inserting reaction:', error);
          return;
        }
      }
      await fetchReactions(post.id);
    },
    [currentIndex, posts, session?.user?.id, userReactions, fetchReactions]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx } = gestureState;
        return Math.abs(dx) > 5;
      },
      onPanResponderMove: (_evt, gestureState) => {
        const dx = gestureState.dx;
        translateX.setValue(dx);
        if (Math.abs(dx) > SWIPE_THRESHOLD && !swipeHapticFired.current) {
          swipeHapticFired.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
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

  const renderCard = (post: PostWithProfile, isCurrent: boolean) => (
    <CommentSheet
      key={post.id}
      postId={post.id}
      userId={session?.user?.id}
      cardHeight={CARD_HEIGHT}
      cardWidth={CARD_WIDTH}
    >
      <CardImage
        post={post}
        imageLoaded={imageLoaded}
        setImageLoaded={setImageLoaded}
        imageError={imageError}
        setImageError={setImageError}
        s={{
          cardImageWrap: styles.cardImageWrap,
          cardImage: styles.cardImage,
          cardImagePlaceholder: styles.cardImagePlaceholder,
          cardImageErrorText: styles.cardImageErrorText,
        }}
      />
      <ScrollView
        style={styles.cardInfoScroll}
        contentContainerStyle={styles.cardInfo}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
      >
        <View style={styles.venueRow}>
          <Feather name="map-pin" size={14} color={theme.colors.textSecondary} />
          <Text style={styles.venueName} numberOfLines={1}>
            {post.venue_name ?? 'Unknown location'}
          </Text>
        </View>
        {post.profiles ? (
          <View style={styles.posterRow}>
            <Avatar uri={post.profiles.avatar_url ?? null} size={24} />
            <Text style={styles.posterName} numberOfLines={1}>
              Posted by {post.profiles.display_name ?? 'Unknown'}
            </Text>
          </View>
        ) : null}
        {post.caption ? (
          <Text style={styles.caption} numberOfLines={2}>
            {post.caption}
          </Text>
        ) : null}
        <View style={styles.timestampRow}>
          <Feather name="clock" size={12} color={theme.colors.textTertiary} />
          <Text style={styles.timestamp}>{timeAgo(post.created_at)}</Text>
        </View>
        <ReactionBar
          counts={isCurrent ? reactionCounts : {}}
          userReactions={isCurrent ? userReactions : new Set()}
          onEmojiPress={handleReactionToggle}
        />
      </ScrollView>
    </CommentSheet>
  );

  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
    >
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.overlayBg, { opacity: overlayOpacity }]}
        pointerEvents="none"
      />
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleClose}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        activeOpacity={0.7}
      >
        <Feather name="x" size={24} color={theme.colors.text} />
      </TouchableOpacity>

      <Animated.View
        style={[
          styles.stackContainer,
          { transform: [{ scale: cardScale }], opacity: cardOpacity },
        ]}
      >
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
          {...panResponder.panHandlers}
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
  cardImageWrap: {
    width: '100%',
    height: IMAGE_HEIGHT,
    position: 'relative',
  },
  cardImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardImageErrorText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
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
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    width: '100%',
    height: IMAGE_HEIGHT,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  cardInfoScroll: {
    flex: 1,
  },
  cardInfo: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  venueName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
  },
  posterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  posterName: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  },
  caption: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timestamp: {
    fontSize: theme.fontSize.xs,
    fontWeight: '400',
    color: theme.colors.textTertiary,
  },
  indicator: {
    position: 'absolute',
    bottom: 48,
    fontSize: theme.fontSize.xs,
    fontWeight: '400',
    color: theme.colors.textTertiary,
  },
});
