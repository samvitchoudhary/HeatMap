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

export type PostWithProfile = Post & {
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
};

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
};
