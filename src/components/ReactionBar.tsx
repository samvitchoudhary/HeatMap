import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { theme } from '../lib/theme';

export const REACTION_EMOJIS = ['🔥', '❤️', '😂', '😮', '😍', '👏'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

type ReactionBarProps = {
  counts: Record<string, number>;
  userReactions: Set<string>;
  onEmojiPress: (emoji: string) => void;
};

export function ReactionBar({
  counts,
  userReactions,
  onEmojiPress,
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
    <View style={styles.container}>
      {REACTION_EMOJIS.map((emoji, index) => {
        const count = counts[emoji] ?? 0;
        const isSelected = userReactions.has(emoji);
        const isAnimating = animatingIndex === index;
        return (
          <TouchableOpacity
            key={emoji}
            style={[styles.reactionButton, isSelected && styles.reactionButtonSelected]}
            onPress={() => handlePress(emoji, index)}
            activeOpacity={0.8}
          >
            <Animated.View
              style={[
                styles.emojiWrap,
                isAnimating && { transform: [{ scale: scaleVal }] },
              ]}
            >
              <Text style={styles.emoji}>{emoji}</Text>
              {count > 0 && (
                <Text style={styles.count}>{count}</Text>
              )}
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
  reactionButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  reactionButtonSelected: {
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.text,
  },
  emojiWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: theme.fontSize.lg,
    marginBottom: 2,
  },
  count: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
});
