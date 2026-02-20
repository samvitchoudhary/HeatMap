import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { theme } from '../lib/theme';

export const REACTION_EMOJIS = ['🔥', '❤️', '😂', '😮', '😍', '👏'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

type ReactionBarProps = {
  counts: Record<string, number>;
  /** The single emoji the current user has selected, or null if none */
  userReaction: string | null;
  onEmojiPress: (emoji: string) => void;
  compact?: boolean;
  /** Card stack bottom bar style: 32x32 touch targets, 11px count */
  cardStyle?: boolean;
  /** Card stack reaction bar: 36x36 touch targets, 16px emoji, 11px count, evenly spaced */
  cardStackBar?: boolean;
};

export function ReactionBar({
  counts,
  userReaction,
  onEmojiPress,
  compact = false,
  cardStyle = false,
  cardStackBar = false,
}: ReactionBarProps) {
  const scaleVal = useRef(new Animated.Value(1)).current;
  const [animatingIndex, setAnimatingIndex] = useState<number | null>(null);

  function handlePress(emoji: string, index: number) {
    setAnimatingIndex(index);
    scaleVal.setValue(1);
    Animated.sequence([
      Animated.spring(scaleVal, {
        toValue: 1.3,
        useNativeDriver: true,
        speed: 50,
        bounciness: 4,
      }),
      Animated.spring(scaleVal, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
        bounciness: 4,
      }),
    ]).start(() => setAnimatingIndex(null));
    onEmojiPress(emoji);
  }

  return (
    <View
      style={[
        styles.container,
        cardStyle && styles.containerCard,
        cardStackBar && styles.containerCardStackBar,
      ]}
    >
      {REACTION_EMOJIS.map((emoji, index) => {
        const count = counts[emoji] ?? 0;
        const isSelected = userReaction === emoji;
        const isAnimating = animatingIndex === index;
        return (
          <TouchableOpacity
            key={emoji}
            style={[
              styles.reactionButton,
              compact && styles.reactionButtonCompact,
              cardStyle && styles.reactionButtonCard,
              cardStackBar && styles.reactionButtonCardStackBar,
              isSelected && styles.reactionButtonSelected,
            ]}
            onPress={() => handlePress(emoji, index)}
            activeOpacity={0.8}
          >
            <Animated.View
              style={[
                styles.emojiWrap,
                compact && styles.emojiWrapCompact,
                isAnimating && { transform: [{ scale: scaleVal }] },
              ]}
            >
              <Text
                style={[
                  styles.emoji,
                  compact && styles.emojiCompact,
                  cardStyle && styles.emojiCard,
                  cardStackBar && styles.emojiCardStackBar,
                ]}
              >
                {emoji}
              </Text>
              <Text
                style={[
                  styles.count,
                  cardStyle && styles.countCard,
                  cardStackBar && styles.countCardStackBar,
                ]}
              >
                {count}
              </Text>
            </Animated.View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  containerCard: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    justifyContent: 'flex-start',
    gap: 4,
  },
  containerCardStackBar: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    flex: 1,
    justifyContent: 'space-between',
  },
  reactionButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  reactionButtonCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  reactionButtonCard: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  reactionButtonCardStackBar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  reactionButtonSelected: {
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.light,
  },
  emojiWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: theme.fontSize.lg,
    marginBottom: 2,
  },
  emojiWrapCompact: {},
  emojiCompact: {
    fontSize: 16,
    marginBottom: 1,
  },
  emojiCard: {
    fontSize: 18,
    marginBottom: 1,
  },
  emojiCardStackBar: {
    fontSize: 16,
    marginBottom: 1,
  },
  count: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  countCard: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  countCardStackBar: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
});
