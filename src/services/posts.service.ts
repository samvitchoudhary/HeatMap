/**
 * posts.service.ts
 *
 * Centralized Supabase queries for the posts table.
 * All post-related database operations go through here.
 * No screen or component should call supabase.from('posts') or supabase.from('post_tags') directly.
 */

import { supabase } from '../lib/supabase';
import { CONFIG } from '../lib/config';
import type { PostWithProfile } from '../types';

/** Standard select columns for posts with joins */
const POST_SELECT = `
  id, user_id, image_url, caption, latitude, longitude, venue_name,
  created_at, category, reaction_count, comment_count,
  profiles:user_id(username, display_name, avatar_url, is_private),
  post_tags(tagged_user_id, profiles:tagged_user_id(display_name, username))
`;

/**
 * Fetch posts for specific users (e.g., map/feed).
 * @param userIds - Array of user IDs to fetch posts for
 * @param cursor - created_at of last post for pagination (optional)
 * @param limit - page size
 */
export async function fetchPostsByUsers(
  userIds: string[],
  cursor?: string,
  limit: number = CONFIG.POSTS_PAGE_SIZE
) {
  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  return query;
}

/**
 * Fetch all posts visible to the user (relying on RLS for privacy).
 * @param cursor - created_at of last post for pagination
 * @param limit - page size
 */
export async function fetchAllVisiblePosts(
  cursor?: string,
  limit: number = CONFIG.POSTS_PAGE_SIZE
) {
  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  return query;
}

/**
 * Fetch posts by a specific user (for profile/gallery).
 */
export async function fetchUserPosts(
  userId: string,
  cursor?: string,
  limit: number = CONFIG.PROFILE_PAGE_SIZE
) {
  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  return query;
}

/**
 * Fetch posts where a user is tagged.
 */
export async function fetchTaggedPosts(
  userId: string,
  limit: number = CONFIG.PROFILE_PAGE_SIZE
) {
  return supabase
    .from('post_tags')
    .select(`post_id, posts:post_id(${POST_SELECT})`)
    .eq('tagged_user_id', userId)
    .limit(limit);
}

/**
 * Fetch a single post by ID.
 */
export async function fetchPostById(postId: string) {
  return supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', postId)
    .single();
}

/**
 * Create a new post.
 */
export async function createPost(post: {
  user_id: string;
  image_url: string;
  caption: string;
  latitude: number;
  longitude: number;
  venue_name: string | null;
  category: string;
}) {
  return supabase
    .from('posts')
    .insert(post)
    .select(POST_SELECT)
    .single();
}

/**
 * Update an existing post.
 */
export async function updatePost(
  postId: string,
  updates: {
    caption?: string;
    venue_name?: string | null;
    category?: string;
    latitude?: number;
    longitude?: number;
  }
) {
  return supabase
    .from('posts')
    .update(updates)
    .eq('id', postId);
}

/**
 * Delete a post.
 */
export async function deletePost(postId: string) {
  return supabase
    .from('posts')
    .delete()
    .eq('id', postId);
}

/**
 * Insert tags for a post.
 */
export async function addPostTags(
  postId: string,
  taggedUserIds: string[]
) {
  if (taggedUserIds.length === 0) return { data: null, error: null };

  const inserts = taggedUserIds.map((uid) => ({
    post_id: postId,
    tagged_user_id: uid,
  }));

  return supabase.from('post_tags').insert(inserts);
}

/**
 * Remove all tags from a post (used before re-adding updated tags on edit).
 */
export async function removePostTags(postId: string) {
  return supabase
    .from('post_tags')
    .delete()
    .eq('post_id', postId);
}

/**
 * Get post count for a user.
 */
export async function getPostCount(userId: string) {
  return supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
}

/**
 * Upload a post image to storage and return the public URL.
 */
export async function uploadPostImage(
  userId: string,
  arraybuffer: ArrayBuffer
): Promise<{ url: string | null; error: any }> {
  const fileName = `${Date.now()}.jpg`;
  const filePath = `${userId}/${fileName}`;

  const { data, error } = await supabase.storage
    .from('posts')
    .upload(filePath, arraybuffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) return { url: null, error };

  const { data: urlData } = supabase.storage
    .from('posts')
    .getPublicUrl(filePath);

  return { url: urlData.publicUrl, error: null };
}

/**
 * Delete a post image from storage.
 */
export async function deletePostImage(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    const pathParts = url.pathname.split('/posts/');
    if (pathParts[1]) {
      await supabase.storage.from('posts').remove([pathParts[1]]);
    }
  } catch {
    // ignore URL parsing/storage errors on cleanup
  }
}

