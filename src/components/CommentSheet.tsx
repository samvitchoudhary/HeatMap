import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Pressable,
  Image,
} from 'react-native';
import type { TextInput } from 'react-native';
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
  parent_id: string | null;
  profiles: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  } | null;
};

type ReplyTarget = { id: string; username: string };

function buildThreadedComments(comments: CommentWithProfile[]): Array<
  | { type: 'top'; comment: CommentWithProfile }
  | { type: 'reply'; comment: CommentWithProfile; parentUsername: string }
> {
  const topLevel = comments
    .filter((c) => !c.parent_id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const repliesByParent: Record<string, Array<{ comment: CommentWithProfile; parentUsername: string }>> = {};

  for (const c of comments) {
    if (c.parent_id) {
      const parent = comments.find((p) => p.id === c.parent_id);
      const parentUsername = parent?.profiles?.username ?? 'unknown';
      if (!repliesByParent[c.parent_id]) repliesByParent[c.parent_id] = [];
      repliesByParent[c.parent_id].push({ comment: c, parentUsername });
    }
  }
  for (const pid of Object.keys(repliesByParent)) {
    repliesByParent[pid].sort(
      (a, b) => new Date(a.comment.created_at).getTime() - new Date(b.comment.created_at).getTime()
    );
  }

  const result: Array<
    | { type: 'top'; comment: CommentWithProfile }
    | { type: 'reply'; comment: CommentWithProfile; parentUsername: string }
  > = [];
  for (const comment of topLevel) {
    result.push({ type: 'top', comment });
    for (const { comment: reply, parentUsername } of repliesByParent[comment.id] ?? []) {
      result.push({ type: 'reply', comment: reply, parentUsername });
    }
  }
  return result;
}

type PostInfo = {
  image_url: string;
  venue_name: string | null;
};

type CommentSheetProps = {
  postId: string;
  post: PostInfo;
  userId: string | undefined;
  cardHeight: number;
  cardWidth: number;
  cardBorderRadius?: number;
  /** When true, card sizes to content instead of fixed height (for FeedCard) */
  contentSized?: boolean;
  onFlippedChange?: (postId: string, flipped: boolean) => void;
  onCommentPosted?: () => void;
  children: (props: { onCommentPress: () => void; commentCount: number }) => React.ReactNode;
};

export function CommentSheet({
  postId,
  post,
  userId,
  cardHeight,
  cardWidth,
  cardBorderRadius = 20,
  contentSized = false,
  onFlippedChange,
  onCommentPosted,
  children,
}: CommentSheetProps) {
  const [flipped, setFlipped] = useState(false);
  const flipAnimation = useRef(new Animated.Value(0)).current;

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
    setReplyTarget(null);
    onFlippedChange?.(postId, false);
  }, [flipAnimation, postId, onFlippedChange]);
  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const inputRef = useRef<TextInput>(null);

  const fetchCommentCount = useCallback(async (pid: string) => {
    const { count, error } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', pid);
    if (!error) {
      setCommentCount(count ?? 0);
    }
  }, []);

  const fetchComments = useCallback(async (pid: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('comments')
      .select('*, profiles:user_id(display_name, username, avatar_url)')
      .eq('post_id', pid)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Error fetching comments:', error);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as CommentWithProfile[];
    setComments(list);
    setCommentCount(list.length);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCommentCount(postId);
  }, [postId, fetchCommentCount]);

  const handleCommentPress = useCallback(() => {
    fetchComments(postId);
    flipToBack();
  }, [postId, fetchComments, flipToBack]);

  const handlePostComment = useCallback(async () => {
    const content = inputText.trim();
    if (!content || !userId || posting) return;

    setPosting(true);
    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      user_id: userId,
      content,
      parent_id: replyTarget?.id ?? null,
    });
    if (error) {
      console.error('Error posting comment:', error);
      setPosting(false);
      return;
    }
    setInputText('');
    setReplyTarget(null);
    await fetchComments(postId);
    onCommentPosted?.();
    setPosting(false);
  }, [inputText, userId, postId, posting, replyTarget, fetchComments, onCommentPosted]);

  useEffect(() => {
    if (replyTarget && flipped) {
      inputRef.current?.focus();
    }
  }, [replyTarget, flipped]);

  const threadedComments = buildThreadedComments(comments);

  const renderCommentItem = ({ item }: { item: typeof threadedComments[0] }) =>
    item.type === 'top' ? (
      <View style={styles.cardBackCommentRow}>
        <View style={styles.cardBackCommentAvatarWrap}>
          <Avatar uri={item.comment.profiles?.avatar_url ?? null} size={24} />
        </View>
        <View style={styles.cardBackCommentContent}>
          <View style={styles.cardBackCommentHeader}>
            <Text style={styles.cardBackCommenterName}>
              {item.comment.profiles?.display_name ?? 'Unknown'}
            </Text>
            <Text style={styles.cardBackCommentTime}>{timeAgo(item.comment.created_at)}</Text>
          </View>
          <Text style={styles.cardBackCommentText}>{item.comment.content}</Text>
          <TouchableOpacity
            onPress={() =>
              setReplyTarget({
                id: item.comment.id,
                username: item.comment.profiles?.username ?? 'unknown',
              })
            }
            activeOpacity={0.7}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Text style={styles.cardBackReplyButton}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    ) : (
      <View style={[styles.cardBackCommentRow, styles.cardBackReplyRow]}>
        <View style={styles.cardBackCommentAvatarWrap}>
          <Avatar uri={item.comment.profiles?.avatar_url ?? null} size={20} />
        </View>
        <View style={styles.cardBackCommentContent}>
          <Text style={styles.cardBackReplyingTo}>replying to @{item.parentUsername}</Text>
          <View style={styles.cardBackCommentHeader}>
            <Text style={styles.cardBackCommenterName}>
              {item.comment.profiles?.display_name ?? 'Unknown'}
            </Text>
            <Text style={styles.cardBackCommentTime}>{timeAgo(item.comment.created_at)}</Text>
          </View>
          <Text style={styles.cardBackCommentText}>{item.comment.content}</Text>
        </View>
      </View>
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
        <Pressable style={styles.cardBack} onPress={flipToFront}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.cardBackKav}
            keyboardVerticalOffset={0}
          >
            <View style={styles.cardBackHeader}>
              <View style={styles.cardBackHeaderLeft}>
                <Image
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
                data={threadedComments}
                keyExtractor={(item) => item.type === 'top' ? item.comment.id : `reply-${item.comment.id}`}
                renderItem={renderCommentItem}
                style={styles.cardBackFlatList}
                contentContainerStyle={styles.cardBackListContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
                onStartShouldSetResponder={() => true}
              />
            )}

            <View
              style={styles.cardBackInputSection}
              onStartShouldSetResponder={() => true}
            >
              {replyTarget && (
                <View style={styles.replyBanner}>
                  <Text style={styles.replyBannerText} numberOfLines={1}>
                    Replying to @{replyTarget.username}
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
                    (!inputText.trim() || posting) && styles.postButtonDisabled,
                  ]}
                  onPress={handlePostComment}
                  disabled={!inputText.trim() || posting}
                  activeOpacity={0.8}
                >
                  {posting ? (
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
  cardBackReplyRow: {
    marginLeft: 40,
  },
  cardBackCommentAvatarWrap: {
    marginRight: 10,
  },
  cardBackCommentContent: {
    flex: 1,
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
  cardBackReplyButton: {
    fontSize: 12,
    color: theme.colors.primary,
  },
  cardBackReplyingTo: {
    fontSize: 12,
    color: theme.colors.textTertiary,
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
  commentList: {
    flex: 1,
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
    backgroundColor: 'rgba(255, 122, 143, 0.15)',
    borderRadius: theme.borderRadius.sm,
    padding: 8,
    marginBottom: theme.spacing.sm,
  },
  replyBannerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
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
  primaryCommentButton: {
    backgroundColor: theme.colors.light,
    width: theme.button.primaryHeight,
    height: theme.button.primaryHeight,
    borderRadius: theme.button.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postButtonDisabled: {
    opacity: 0.5,
  },
});
