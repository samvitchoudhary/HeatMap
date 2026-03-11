/**
 * CardContent.tsx
 *
 * Card face (front side) rendering: post image, info, reaction bar, comment count.
 * Extracted from CardStack.
 */

import React, { memo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  StyleSheet,
  Image,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { PostWithProfile } from '../types';
import { theme } from '../lib/theme';
import { timeAgo } from '../lib/timeAgo';
import { ReactionBar } from './ReactionBar';
import { TaggedLine } from './TaggedLine';

const BOTTOM_BAR_HEIGHT = 50;

type CardImageStyles = {
  cardImageWrap: object;
  cardImage: object;
  cardImagePlaceholder: object;
  cardImageErrorText: object;
};

const CardImage = memo(function CardImage({
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
        Animated.sequence([
          Animated.spring(heartScale, {
            toValue: 1.3,
            speed: 80,
            bounciness: 12,
            useNativeDriver: true,
          }),
          Animated.spring(heartScale, {
            toValue: 1.0,
            speed: 40,
            bounciness: 8,
            useNativeDriver: true,
          }),
          Animated.delay(200),
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
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: '#FFF', opacity: flashOpacity },
        ]}
      />
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
        <TouchableWithoutFeedback onPress={handleDoubleTap}>
          {imageContent}
        </TouchableWithoutFeedback>
      ) : (
        imageContent
      )}
    </View>
  );
});

/** Dot pagination indicator */
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
  const startIndex =
    total > 7 ? Math.max(0, Math.min(current - 3, total - 7)) : 0;
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

export type CardContentProps = {
  post: PostWithProfile;
  isCurrent: boolean;
  currentUserId: string | undefined;
  imageError: Record<string, boolean>;
  setImageError: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  reactionCounts: Record<string, number>;
  userReaction: string | null;
  onReact: (emoji: string) => void;
  onCommentPress: () => void;
  commentCount: number;
  onExpandPhoto: (url: string) => void;
  onProfilePress?: (userId: string) => void;
  onDoubleTapHeart: () => void;
  onDeletePost?: (post: PostWithProfile) => void;
  totalPosts: number;
  currentIndex: number;
  activeDotAnimated: Animated.Value;
};

export const CardContent = memo(function CardContent({
  post,
  isCurrent,
  currentUserId,
  imageError,
  setImageError,
  reactionCounts,
  userReaction,
  onReact,
  onCommentPress,
  commentCount,
  onExpandPhoto,
  onProfilePress,
  onDoubleTapHeart,
  onDeletePost,
  totalPosts,
  currentIndex,
  activeDotAnimated,
}: CardContentProps) {
  const cardImageStyles = {
    cardImageWrap: styles.cardImageWrap,
    cardImage: styles.cardImage,
    cardImagePlaceholder: styles.cardImagePlaceholder,
    cardImageErrorText: styles.cardImageErrorText,
  };

  return (
    <View style={styles.cardFront}>
      <View style={styles.photoSection}>
        <CardImage
          post={post}
          imageError={imageError}
          setImageError={setImageError}
          s={cardImageStyles}
          onDoubleTap={onDoubleTapHeart}
        />
        {!imageError[post.id] && (
          <TouchableOpacity
            style={styles.expandButton}
            onPress={() => onExpandPhoto(post.image_url)}
            activeOpacity={0.7}
          >
            <Feather name="maximize-2" size={18} color="#FFF" />
          </TouchableOpacity>
        )}
        {post.user_id === currentUserId && onDeletePost && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => onDeletePost(post)}
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
              {post.profiles?.display_name ?? 'Deleted User'}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.infoDisplayName} numberOfLines={1}>
            {post.user_id === currentUserId
              ? 'You'
              : (post.profiles?.display_name ?? 'Deleted User')}
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
        <Text style={styles.infoTimestamp}>{timeAgo(post.created_at)}</Text>
      </View>
      {isCurrent && (
        <DotIndicator
          total={totalPosts}
          current={currentIndex}
          activeDotAnimated={activeDotAnimated}
        />
      )}
      <View style={styles.bottomBar}>
        <View style={styles.reactionsSection}>
          <ReactionBar
            counts={isCurrent ? reactionCounts : {}}
            userReaction={isCurrent ? userReaction : null}
            onEmojiPress={onReact}
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
  );
});

const styles = StyleSheet.create({
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
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
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
});
