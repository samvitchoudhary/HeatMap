/**
 * commentUtils.ts
 *
 * Shared comment threading logic used by CommentSheet and FeedCommentModal.
 * Uses Map-based O(n) lookup instead of .find() inside a loop.
 */

export type CommentWithProfile = {
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

export type ThreadedComment =
  | { type: 'top'; comment: CommentWithProfile }
  | { type: 'reply'; comment: CommentWithProfile; parentUsername: string; parentUserId: string };

/**
 * Groups comments into a flat list of top-level + nested replies, sorted by created_at.
 * O(n) via Map lookup instead of O(n²) via .find().
 */
export function buildThreadedComments(comments: CommentWithProfile[]): ThreadedComment[] {
  if (!comments || comments.length === 0) return [];

  const byId = new Map<string, CommentWithProfile>();
  for (const c of comments) {
    byId.set(c.id, c);
  }

  const topLevel: CommentWithProfile[] = [];
  const repliesByParent: Record<string, Array<{ comment: CommentWithProfile; parentUsername: string; parentUserId: string }>> = {};

  for (const c of comments) {
    if (!c.parent_id) {
      topLevel.push(c);
    } else {
      const parent = byId.get(c.parent_id);
      const parentUsername = parent?.profiles?.username ?? 'deleted';
      const parentUserId = parent?.user_id ?? '';
      if (!repliesByParent[c.parent_id]) repliesByParent[c.parent_id] = [];
      repliesByParent[c.parent_id].push({ comment: c, parentUsername, parentUserId });
    }
  }

  topLevel.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  for (const pid of Object.keys(repliesByParent)) {
    repliesByParent[pid].sort(
      (a, b) => new Date(a.comment.created_at).getTime() - new Date(b.comment.created_at).getTime()
    );
  }

  const result: ThreadedComment[] = [];
  for (const comment of topLevel) {
    result.push({ type: 'top', comment });
    for (const reply of repliesByParent[comment.id] ?? []) {
      result.push({ type: 'reply', ...reply });
    }
  }
  return result;
}
