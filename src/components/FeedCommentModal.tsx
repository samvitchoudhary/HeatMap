/**
 * FeedCommentModal.tsx
 *
 * Modal for viewing and posting comments on a feed post.
 *
 * Key responsibilities:
 * - Full-screen modal with threaded comments list
 * - Post new comments, reply to existing (with @mention)
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
} from 'react-native';
import type { TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { Avatar } from './Avatar';
import { StyledTextInput } from './StyledTextInput';
import { timeAgo } from '../lib/timeAgo';
import { useComments } from '../hooks/useComments';

type ReplyTarget = { id: string; username: string; parentUserId: string };

type FeedCommentModalProps = {
  visible: boolean;
  postId: string;
  postUserId?: string;
  userId: string | undefined;
  onClose: () => void;
  onCommentPosted?: () => void;
};

export function FeedCommentModal({
  visible,
  postId,
  postUserId,
  userId,
  onClose,
  onCommentPosted,
}: FeedCommentModalProps) {
  const [inputText, setInputText] = useState('');
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const inputRef = useRef<TextInput>(null);
  const {
    comments,
    threadedComments,
    loading,
    loadingMore,
    hasMore,
    fetchComments,
    loadMore,
    postComment,
  } = useComments(postId, postUserId ?? undefined, userId);

  useEffect(() => {
    if (visible && postId) {
      fetchComments(false);
    } else if (!visible) {
      setReplyTarget(null);
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
    setReplyTarget(null);
    onCommentPosted?.();
  }, [inputText, postComment, onCommentPosted]);

  useEffect(() => {
    if (replyTarget && visible) {
      inputRef.current?.focus();
    }
  }, [replyTarget, visible]);

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
                  {threadedComments.map((item) =>
                  item.type === 'top' ? (
                    <View key={item.comment.id} style={styles.commentRow}>
                      <View style={styles.commentAvatarWrap}>
                        <Avatar uri={item.comment.profiles?.avatar_url ?? null} size={28} />
                      </View>
                      <View style={styles.commentContent}>
                        <Text style={styles.commenterName}>
                          {item.comment.user_id === userId ? 'You' : (item.comment.profiles?.display_name ?? 'Deleted User')}
                        </Text>
                        <Text style={styles.commentText}>{item.comment.content}</Text>
                        <Text style={styles.commentTime}>{timeAgo(item.comment.created_at)}</Text>
                        <TouchableOpacity
                          onPress={() =>
                            setReplyTarget({
                              id: item.comment.id,
                              username: item.comment.profiles?.username ?? 'deleted',
                              parentUserId: item.comment.user_id,
                            })
                          }
                          activeOpacity={0.7}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        >
                          <Text style={styles.replyButton}>Reply</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View key={item.comment.id} style={[styles.commentRow, styles.replyRow]}>
                      <View style={styles.commentAvatarWrap}>
                        <Avatar uri={item.comment.profiles?.avatar_url ?? null} size={24} />
                      </View>
                      <View style={styles.commentContent}>
                        <Text style={styles.replyingTo}>
                          replying to {item.parentUserId === userId ? 'You' : `@${item.parentUsername}`}
                        </Text>
                        <Text style={styles.commenterNameReply}>
                          {item.comment.user_id === userId ? 'You' : (item.comment.profiles?.display_name ?? 'Deleted User')}
                        </Text>
                        <Text style={styles.commentTextReply}>{item.comment.content}</Text>
                        <Text style={styles.commentTime}>{timeAgo(item.comment.created_at)}</Text>
                      </View>
                    </View>
                  )
                )}
                </>
              )}
            </ScrollView>

            {replyTarget && (
              <View style={styles.replyBanner}>
                <Text style={styles.replyBannerText} numberOfLines={1}>
                  Replying to {replyTarget.parentUserId === userId ? 'You' : `@${replyTarget.username}`}
                </Text>
                <TouchableOpacity
                  onPress={() => setReplyTarget(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={16} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              </View>
            )}
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
                  (!inputText.trim() || posting) && styles.sendButtonDisabled,
                ]}
                onPress={handlePostComment}
                disabled={!inputText.trim() || posting}
                activeOpacity={0.8}
              >
                {posting ? (
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
  replyButton: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  replyRow: {
    marginLeft: 40,
    marginBottom: theme.listRowGap,
  },
  replyingTo: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  commenterNameReply: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  commentTextReply: {
    fontSize: 13,
    fontWeight: '400',
    color: theme.colors.text,
    marginBottom: 2,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.sm,
    padding: 8,
    marginBottom: theme.spacing.sm,
  },
  replyBannerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    flex: 1,
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
