export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
};

export type Post = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  venue_name: string | null;
  latitude: number;
  longitude: number;
  created_at: string;
};

export type PostTag = {
  tagged_user_id: string;
  profiles: {
    display_name: string;
    username: string;
  } | null;
};

export type PostWithProfile = Post & {
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  post_tags?: PostTag[];
};

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
};
