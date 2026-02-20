import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import { Avatar } from './Avatar';
import { StyledTextInput } from './StyledTextInput';

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

type CommentWithProfile = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  } | null;
};

type FeedCommentModalProps = {
  visible: boolean;
  postId: string;
  userId: string | undefined;
  onClose: () => void;
  onCommentPosted?: () => void;
};

export function FeedCommentModal({
  visible,
  postId,
  userId,
  onClose,
  onCommentPosted,
}: FeedCommentModalProps) {
  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  const fetchComments = useCallback(async (pid: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('comments')
      .select('*, profiles(display_name, username, avatar_url)')
      .eq('post_id', pid)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Error fetching comments:', error);
      setLoading(false);
      return;
    }
    setComments((data ?? []) as CommentWithProfile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible && postId) {
      fetchComments(postId);
    }
  }, [visible, postId, fetchComments]);

  const handlePostComment = useCallback(async () => {
    const content = inputText.trim();
    if (!content || !userId || posting) return;

    setPosting(true);
    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      user_id: userId,
      content,
    });
    if (error) {
      console.error('Error posting comment:', error);
      setPosting(false);
      return;
    }
    setInputText('');
    await fetchComments(postId);
    onCommentPosted?.();
    setPosting(false);
  }, [inputText, userId, postId, posting, fetchComments, onCommentPosted]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                comments.map((comment) => (
                  <View key={comment.id} style={styles.commentRow}>
                    <View style={styles.commentAvatarWrap}>
                      <Avatar uri={comment.profiles?.avatar_url ?? null} size={28} />
                    </View>
                    <View style={styles.commentContent}>
                      <Text style={styles.commenterName}>
                        {comment.profiles?.display_name ?? 'Unknown'}
                      </Text>
                      <Text style={styles.commentText}>{comment.content}</Text>
                      <Text style={styles.commentTime}>
                        {timeAgo(comment.created_at)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.inputRow}>
              <StyledTextInput
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
