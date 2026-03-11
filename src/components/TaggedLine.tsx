/**
 * TaggedLine.tsx
 *
 * Displays "with @user1, @user2 +N others" for tagged posts.
 * Shared between CardContent, FeedCard, and CardStack.
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { theme } from '../lib/theme';
import type { PostTag } from '../types';

type TaggedLineProps = {
  tags: PostTag[] | undefined;
  onProfilePress?: (userId: string) => void;
};

export const TaggedLine = React.memo(function TaggedLine({
  tags,
  onProfilePress,
}: TaggedLineProps) {
  if (!tags || tags.length === 0) return null;
  const maxShow = 2;
  const shown = tags.slice(0, maxShow);
  const rest = tags.length - maxShow;
  return (
    <Text style={styles.infoTaggedLine} numberOfLines={1}>
      {' with '}
      {shown.map((t, i) => {
        const username = t.profiles?.username ?? 'deleted';
        const content = `@${username}`;
        return onProfilePress ? (
          <Text key={t.tagged_user_id}>
            {i > 0 ? ', ' : ''}
            <Text
              style={styles.infoTaggedLink}
              onPress={() => onProfilePress(t.tagged_user_id)}
            >
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
});

const styles = StyleSheet.create({
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
});
