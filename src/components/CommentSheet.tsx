/**
 * CommentSheet.tsx
 *
 * NOTE: This file is over 600 lines. Future refactoring candidates:
 * - Extract useComments hook (fetchComments, handlePostComment)
 * - Extract CommentItem component
 * - Extract CommentInputBar component (text input, send button)
 * - Extract useFlipAnimation hook (flipAnimation, interpolation, flipToBack/flipToFront)
 *
 * Flip-card component: front = post content, back = flat comments list.
 *
 * Key responsibilities:
 * - 3D flip animation (rotateY) between front (photo/info) and back (comments)
 * - Fetches and displays comments (flat, chronological)
 * - Used inside CardStack and FeedCard - provides onCommentPress + commentCount to children
 * - Lazy-loads comments when flipped to back (or when initialFlipped)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Pressable,
  Alert,
  ActionSheetIOS,
} from 'react-native';
import type { TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { Avatar } from './Avatar';
import { SmoothImage } from './SmoothImage';
import { StyledTextInput } from './StyledTextInput';
import { timeAgo } from '../lib/timeAgo';
import { useComments, type Comment } from '../hooks/useComments';
import { useToast } from '../lib/ToastContext';

type PostInfo = {
  image_url: string;
  venue_name: string | null;
};

type CommentSheetProps = {
  postId: string;
  post: PostInfo;
  postUserId?: string;
  userId: string | undefined;
  cardHeight: number;
  cardWidth: number;
  cardBorderRadius?: number;
  /** When true, card sizes to content instead of fixed height (for FeedCard) */
  contentSized?: boolean;
  onFlippedChange?: (postId: string, flipped: boolean) => void;
  onCommentPosted?: () => void;
  /** Called after a comment is deleted (e.g. sync parent comment count) */
  onCommentDeleted?: () => void;
  /** When true, start with the card flipped to comments side */
  initialFlipped?: boolean;
  /** Denormalized comment count from the post row — avoids a separate count query */
  initialCommentCount?: number;
  /** Navigate to a user's profile (comment authors, @mentions) */
  onProfilePress?: (userId: string) => void;
  children: (props: { onCommentPress: () => void; commentCount: number }) => React.ReactNode;
};

export function CommentSheet({
  postId,
  post,
  postUserId,
  userId,
  cardHeight,
  cardWidth,
  cardBorderRadius = 20,
  contentSized = false,
  onFlippedChange,
  onCommentPosted,
  onCommentDeleted,
  initialFlipped = false,
  initialCommentCount = 0,
  onProfilePress,
  children,
}: CommentSheetProps) {
  const { showToast } = useToast();
  const [flipped, setFlipped] = useState(initialFlipped);
  const flipAnimation = useRef(new Animated.Value(initialFlipped ? 180 : 0)).current;

  const frontInterpolate = flipAnimation.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });
  const backInterpolate = flipAnimation.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });
  const frontAnimatedStyle = {
    transform: [{ perspective: 1000 }, { rotateY: frontInterpolate }],
  };
  const backAnimatedStyle = {
    transform: [{ perspective: 1000 }, { rotateY: backInterpolate }],
  };

  const flipToBack = useCallback(() => {
    Animated.spring(flipAnimation, {
      toValue: 180,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setFlipped(true);
    onFlippedChange?.(postId, true);
  }, [flipAnimation, postId, onFlippedChange]);

  const flipToFront = useCallback(() => {
    Animated.spring(flipAnimation, {
      toValue: 0,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setFlipped(false);
    onFlippedChange?.(postId, false);
  }, [flipAnimation, postId, onFlippedChange]);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleCommentDeleted = useCallback(() => {
    setCommentCount((c) => Math.max(0, c - 1));
    onCommentDeleted?.();
  }, [onCommentDeleted]);

  const {
    comments,
    loading,
    loadingMore,
    hasMore,
    submitting,
    fetchComments,
    loadMore,
    postComment,
    deleteComment,
  } = useComments(postId, postUserId ?? undefined, userId, handleCommentDeleted);

  useEffect(() => {
    if (initialFlipped) {
      flipAnimation.setValue(180);
      setFlipped(true);
      onFlippedChange?.(postId, true);
      fetchComments(false);
    }
  }, []);

  useEffect(() => {
    setCommentCount(initialCommentCount);
  }, [postId, initialCommentCount]);

  const handleCommentPress = useCallback(() => {
    fetchComments(false);
    flipToBack();
  }, [fetchComments, flipToBack]);

  const handlePostComment = useCallback(async () => {
    const content = inputText.trim();
    if (!content) return;
    const ok = await postComment(content);
    if (!ok) {
      Alert.alert('Error', 'Could not post comment. Please try again.');
      return;
    }
    setInputText('');
    setCommentCount((c) => c + 1);
    onCommentPosted?.();
  }, [inputText, postComment, onCommentPosted]);

  const handlePressProfile = useCallback(
    (targetUserId: string | undefined | null) => {
      if (!targetUserId) return;
      if (userId && targetUserId === userId) {
        showToast("That's you!");
        return;
      }
      onProfilePress?.(targetUserId);
    },
    [userId, onProfilePress, showToast]
  );

  const canDeleteComment = useCallback(
    (comment: { user_id: string }) => {
      if (!userId) return false;
      if (comment.user_id === userId) return true;
      if (postUserId === userId) return true;
      return false;
    },
    [userId, postUserId]
  );

  const handleLongPressComment = useCallback(
    (comment: { id: string; user_id: string }) => {
      if (!canDeleteComment(comment)) return;

      const confirmDelete = () => {
        Alert.alert(
          'Delete Comment',
          'Are you sure you want to delete this comment?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await deleteComment(comment.id);
              },
            },
          ]
        );
      };

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Delete Comment', 'Cancel'],
            destructiveButtonIndex: 0,
            cancelButtonIndex: 1,
          },
          (buttonIndex) => {
            if (buttonIndex === 0) confirmDelete();
          }
        );
      } else {
        confirmDelete();
      }
    },
    [canDeleteComment, deleteComment]
  );

  const renderCommentItem = ({ item }: { item: Comment }) => (
    <Pressable
      onLongPress={() => handleLongPressComment(item)}
      delayLongPress={500}
      style={({ pressed }) => [
        styles.cardBackCommentRow,
        pressed && canDeleteComment(item) && { opacity: 0.7 },
      ]}
    >
      <View style={styles.cardBackCommentAvatarWrap}>
        <TouchableOpacity
          onPress={() => handlePressProfile(item.user_id)}
          activeOpacity={0.7}
          accessibilityLabel="View profile"
          accessibilityRole="button"
        >
          <Avatar uri={item.profiles?.avatar_url ?? null} size={24} />
        </TouchableOpacity>
      </View>
      <View style={styles.cardBackCommentContent}>
        <View style={styles.cardBackCommentHeader}>
          <TouchableOpacity
            onPress={() => handlePressProfile(item.user_id)}
            activeOpacity={0.7}
            style={styles.cardBackCommentNameTap}
            accessibilityLabel="View profile"
            accessibilityRole="button"
          >
            <Text style={styles.cardBackCommenterName}>
              {item.user_id === userId ? 'You' : (item.profiles?.display_name ?? 'Deleted User')}
            </Text>
          </TouchableOpacity>
          <Text style={styles.cardBackCommentTime}>{timeAgo(item.created_at)}</Text>
        </View>
        <Text style={styles.cardBackCommentText}>{item.content}</Text>
      </View>
    </Pressable>
  );

  const flipWrapperStyle = contentSized
    ? { width: cardWidth }
    : { width: cardWidth, height: cardHeight };
  const flipFaceStyle = contentSized
    ? { width: cardWidth, borderRadius: cardBorderRadius }
    : { width: cardWidth, height: cardHeight, borderRadius: cardBorderRadius };

  return (
    <View style={[styles.flipWrapper, contentSized && styles.flipWrapperContentSized, flipWrapperStyle]}>
      {contentSized && (
        <View style={styles.flipSizer} pointerEvents="none">
          {children({ onCommentPress: () => {}, commentCount })}
        </View>
      )}
      <Animated.View
        style={[
          styles.flipFace,
          flipFaceStyle,
          contentSized && styles.flipFaceContentSized,
          frontAnimatedStyle,
        ]}
        pointerEvents={flipped ? 'none' : 'auto'}
      >
        {children({ onCommentPress: handleCommentPress, commentCount })}
      </Animated.View>
      <Animated.View
        style={[
          styles.flipFace,
          styles.flipBack,
          flipFaceStyle,
          contentSized && { minHeight: cardHeight },
          backAnimatedStyle,
        ]}
        pointerEvents={flipped ? 'auto' : 'none'}
      >
        <Pressable
          style={styles.cardBack}
          onPress={() => {
            Keyboard.dismiss();
            flipToFront();
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.cardBackKav}
            keyboardVerticalOffset={0}
          >
            <View style={styles.cardBackHeader}>
              <View style={styles.cardBackHeaderLeft}>
                <SmoothImage
                  source={{ uri: post.image_url }}
                  style={styles.cardBackThumbnail}
                />
                <Text style={styles.cardBackVenueName} numberOfLines={1}>
                  {post.venue_name ?? 'Unknown location'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={flipToFront}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
                accessibilityLabel="Back to photo"
                accessibilityRole="button"
              >
                <Feather name="image" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.cardBackCommentsArea}>
                <ActivityIndicator size="small" color={theme.colors.text} style={styles.loader} />
              </View>
            ) : comments.length === 0 ? (
              <View style={styles.cardBackCommentsArea}>
                <Text style={styles.cardBackEmptyText}>No comments yet</Text>
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(item) => item.id}
                renderItem={renderCommentItem}
                ListHeaderComponent={
                  hasMore ? (
                    <TouchableOpacity
                      onPress={() => loadMore()}
                      disabled={loadingMore}
                      style={styles.loadMoreButton}
                      activeOpacity={0.7}
                      accessibilityLabel="Load earlier comments"
                      accessibilityRole="button"
                    >
                      {loadingMore ? (
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                      ) : (
                        <Text style={styles.loadMoreText}>Load earlier comments</Text>
                      )}
                    </TouchableOpacity>
                  ) : null
                }
                style={styles.cardBackFlatList}
                contentContainerStyle={styles.cardBackListContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                onStartShouldSetResponder={() => true}
              />
            )}

            <View
              style={styles.cardBackInputSection}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.cardBackInputRow}>
                <StyledTextInput
                  ref={inputRef}
                  style={styles.cardBackInput}
                  placeholder="Write a comment..."
                  value={inputText}
                  onChangeText={setInputText}
                  multiline={false}
                  onSubmitEditing={handlePostComment}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  style={[
                    styles.cardBackSendButton,
                    (!inputText.trim() || submitting) && styles.postButtonDisabled,
                  ]}
                  onPress={handlePostComment}
                  disabled={!inputText.trim() || submitting}
                  activeOpacity={0.8}
                  accessibilityLabel="Send comment"
                  accessibilityRole="button"
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Feather name="send" size={16} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flipWrapper: {
    position: 'relative',
  },
  flipWrapperContentSized: {
    minHeight: 0,
  },
  flipSizer: {
    opacity: 0,
    width: '100%',
    pointerEvents: 'none',
  },
  flipFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: 'hidden' as const,
    overflow: 'hidden',
    backgroundColor: theme.colors.cardBackground,
  },
  flipFaceContentSized: {
    height: undefined,
    bottom: 0,
  },
  flipBack: {
    backgroundColor: theme.colors.surface,
  },
  cardBack: {
    flex: 1,
    height: '100%',
  },
  cardBackKav: {
    flex: 1,
  },
  cardBackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  cardBackHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cardBackThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceLight,
  },
  cardBackVenueName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
  },
  cardBackFlatList: {
    flex: 1,
  },
  cardBackListContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  loadMoreButton: {
    padding: 12,
    alignItems: 'center',
  },
  loadMoreText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  cardBackCommentsArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
  },
  cardBackEmptyText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  cardBackCommentRow: {
    flexDirection: 'row',
    marginBottom: theme.listRowGap,
  },
  cardBackCommentAvatarWrap: {
    marginRight: 10,
  },
  cardBackCommentContent: {
    flex: 1,
  },
  cardBackCommentNameTap: {
    flexShrink: 1,
  },
  cardBackCommentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  cardBackCommenterName: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  cardBackCommentTime: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  cardBackCommentText: {
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: 2,
  },
  cardBackInputSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  cardBackInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardBackInput: {
    flex: 1,
    height: 40,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
  },
  cardBackSendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: {
    marginTop: theme.spacing.md,
  },
  postButtonDisabled: {
    opacity: 0.5,
  },
});
