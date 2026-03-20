/**
 * FeedCommentModal.tsx
 *
 * Modal for viewing and posting comments on a feed post.
 *
 * Key responsibilities:
 * - Full-screen modal with flat comments list
 * - Post new comments
 * - Used when user taps comment count from FeedCard (Feed screen)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
  Alert,
  ActionSheetIOS,
} from 'react-native';
import type { TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { Avatar } from './Avatar';
import { StyledTextInput } from './StyledTextInput';
import { timeAgo } from '../lib/timeAgo';
import { useComments, type Comment } from '../hooks/useComments';
import { useToast } from '../lib/ToastContext';

type FeedCommentModalProps = {
  visible: boolean;
  postId: string;
  postUserId?: string;
  userId: string | undefined;
  onClose: () => void;
  onCommentPosted?: () => void;
  /** Called after a comment is deleted (e.g. sync parent comment count) */
  onCommentDeleted?: () => void;
  onProfilePress?: (userId: string) => void;
};

export function FeedCommentModal({
  visible,
  postId,
  postUserId,
  userId,
  onClose,
  onCommentPosted,
  onCommentDeleted,
  onProfilePress,
}: FeedCommentModalProps) {
  const { showToast } = useToast();
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleCommentDeleted = useCallback(() => {
    onCommentDeleted?.();
  }, [onCommentDeleted]);

  const {
    comments,
    loading,
    loadingMore,
    hasMore,
    fetchComments,
    loadMore,
    postComment,
    submitting,
    deleteComment,
  } = useComments(postId, postUserId ?? undefined, userId, handleCommentDeleted);

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

  useEffect(() => {
    if (visible && postId) {
      fetchComments(false);
    }
  }, [visible, postId, fetchComments]);

  const handlePostComment = useCallback(async () => {
    const content = inputText.trim();
    if (!content) return;
    const ok = await postComment(content);
    if (!ok) {
      Alert.alert('Error', 'Could not post comment. Please try again.');
      return;
    }
    setInputText('');
    onCommentPosted?.();
  }, [inputText, postComment, onCommentPosted]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => {
          Keyboard.dismiss();
          onClose();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Comments</Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
              >
                <Feather name="x" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.commentList}
              contentContainerStyle={styles.commentListContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
              overScrollMode="never"
            >
              {loading ? (
                <ActivityIndicator size="small" color={theme.colors.text} style={styles.loader} />
              ) : comments.length === 0 ? (
                <Text style={styles.emptyText}>No comments yet.</Text>
              ) : (
                <>
                  {hasMore && (
                    <TouchableOpacity
                      onPress={loadMore}
                      disabled={loadingMore}
                      style={styles.loadMoreButton}
                      activeOpacity={0.7}
                    >
                      {loadingMore ? (
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                      ) : (
                        <Text style={styles.loadMoreText}>Load earlier comments</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {comments.map((item: Comment) => (
                    <Pressable
                      key={item.id}
                      onLongPress={() => handleLongPressComment(item)}
                      delayLongPress={500}
                      style={({ pressed }) => [
                        styles.commentRow,
                        pressed && canDeleteComment(item) && { opacity: 0.7 },
                      ]}
                    >
                      <View style={styles.commentAvatarWrap}>
                        <TouchableOpacity
                          onPress={() => handlePressProfile(item.user_id)}
                          activeOpacity={0.7}
                          accessibilityLabel="View profile"
                          accessibilityRole="button"
                        >
                          <Avatar uri={item.profiles?.avatar_url ?? null} size={28} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.commentContent}>
                        <TouchableOpacity
                          onPress={() => handlePressProfile(item.user_id)}
                          activeOpacity={0.7}
                          style={styles.commentNameTap}
                        >
                          <Text style={styles.commenterName}>
                            {item.user_id === userId ? 'You' : (item.profiles?.display_name ?? 'Deleted User')}
                          </Text>
                        </TouchableOpacity>
                        <Text style={styles.commentText}>{item.content}</Text>
                        <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              )}
            </ScrollView>

            <View style={styles.inputRow}>
              <StyledTextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Write a comment..."
                value={inputText}
                onChangeText={setInputText}
                multiline={false}
                onSubmitEditing={handlePostComment}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!inputText.trim() || submitting) && styles.sendButtonDisabled,
                ]}
                onPress={handlePostComment}
                disabled={!inputText.trim() || submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={theme.colors.textOnLight} />
                ) : (
                  <Feather name="send" size={18} color={theme.colors.textOnLight} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  keyboardView: {
    maxHeight: '85%',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: theme.screenPadding,
    paddingBottom: theme.spacing.lg,
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: theme.fontSize.title,
    fontWeight: '700',
    color: theme.colors.text,
  },
  commentList: {
    maxHeight: 350,
  },
  commentListContent: {
    paddingVertical: theme.spacing.sm,
  },
  loader: {
    marginTop: theme.spacing.md,
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
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  commentRow: {
    flexDirection: 'row',
    marginBottom: theme.listRowGap,
  },
  commentAvatarWrap: {
    marginRight: theme.spacing.sm,
  },
  commentContent: {
    flex: 1,
  },
  commentNameTap: {
    alignSelf: 'flex-start',
  },
  commenterName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  commentText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.text,
    marginBottom: 2,
  },
  commentTime: {
    fontSize: theme.fontSize.xs,
    fontWeight: '400',
    color: theme.colors.textTertiary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  input: {
    flex: 1,
    borderRadius: theme.borderRadius.full,
  },
  sendButton: {
    backgroundColor: theme.colors.light,
    width: theme.button.primaryHeight,
    height: theme.button.primaryHeight,
    borderRadius: theme.button.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
