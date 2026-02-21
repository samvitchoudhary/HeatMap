import React, { useRef, useState, useEffect } from 'react';
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

function ReactionButton({
  emoji,
  count,
  isSelected,
  onPress,
  compact,
  cardStyle,
  cardStackBar,
  scaleVal,
  isAnimating,
}: {
  emoji: string;
  count: number;
  isSelected: boolean;
  onPress: () => void;
  compact: boolean;
  cardStyle: boolean;
  cardStackBar: boolean;
  scaleVal: Animated.Value;
  isAnimating: boolean;
}) {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: isSelected ? -4 : 0,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }, [isSelected, translateY]);

  return (
    <TouchableOpacity
      style={[
        styles.reactionButton,
        compact && styles.reactionButtonCompact,
        cardStyle && styles.reactionButtonCard,
        cardStackBar && styles.reactionButtonCardStackBar,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Animated.View
        style={[
          styles.emojiWrap,
          compact && styles.emojiWrapCompact,
          {
            transform: isAnimating
              ? [{ translateY }, { scale: scaleVal }]
              : [{ translateY }],
          },
        ]}
      >
        <Text
          style={[
            styles.emoji,
            compact && styles.emojiCompact,
            cardStyle && styles.emojiCard,
            cardStackBar && styles.emojiCardStackBar,
            isSelected && styles.emojiSelectedShadow,
          ]}
        >
          {emoji}
        </Text>
        {isSelected && <View style={styles.selectedDot} />}
        {count >= 1 && (
          <Text
            style={[
              styles.count,
              cardStyle && styles.countCard,
              cardStackBar && styles.countCardStackBar,
            ]}
          >
            {count}
          </Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

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
      {REACTION_EMOJIS.map((emoji, index) => (
        <ReactionButton
          key={emoji}
          emoji={emoji}
          count={counts[emoji] ?? 0}
          isSelected={userReaction === emoji}
          onPress={() => handlePress(emoji, index)}
          compact={compact}
          cardStyle={cardStyle}
          cardStackBar={cardStackBar}
          scaleVal={scaleVal}
          isAnimating={animatingIndex === index}
        />
      ))}
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
  emojiSelectedShadow: {
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  selectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.primary,
    marginTop: 4,
    marginBottom: 2,
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
