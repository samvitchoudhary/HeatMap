/**
 * types/index.ts
 *
 * Core TypeScript type definitions for HeatMap.
 *
 * Key responsibilities:
 * - Profile, Post, PostTag, PostWithProfile, Friendship types used across the app
 * - Shapes align with Supabase table schemas and joined query results
 */

/** User profile from profiles table - used for avatars, display names, usernames */
export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
};

/** Post from posts table - core content type for map pins and feed cards */
export type Post = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  venue_name: string | null;
  latitude: number;
  longitude: number;
  created_at: string;
  category: string | null;
};

/** Tag on a post - links a tagged user to their profile for display */
export type PostTag = {
  tagged_user_id: string;
  profiles: {
    display_name: string;
    username: string;
  } | null;
};

/** Post with author profile and optional tags - used in feed, map, profile views */
export type PostWithProfile = Post & {
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  post_tags?: PostTag[];
};

/** Friendship record - requester/addressee and status for friend feed filtering */
export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
};
