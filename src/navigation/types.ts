/**
 * navigation/types.ts
 *
 * TypeScript param lists for all navigators.
 *
 * Used by useNavigation, route.params, and navigate() for type-safe params.
 */

import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type MainTabParamList = {
  Map:
    | {
        latitude?: number;
        longitude?: number;
        postId?: string;
        showComments?: boolean;
      }
    | undefined;
  Feed: undefined;
  Notifications: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  SignUp: undefined;
  ProfileSetup: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  FriendProfile: { userId: string };
};

export type MapStackParamList = {
  Map:
    | {
        latitude?: number;
        longitude?: number;
        postId?: string;
        showComments?: boolean;
      }
    | undefined;
  Upload:
    | {
        imageUri?: string;
        exifLocation?: { latitude: number; longitude: number } | null;
        editMode?: boolean;
        editPost?: {
          id: string;
          image_url: string;
          caption: string | null;
          venue_name: string | null;
          category: string | null;
          latitude: number;
          longitude: number;
          post_tags?: Array<{
            tagged_user_id: string;
            profiles?: { display_name: string; username: string } | null;
          }>;
        };
      }
    | undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  Friends: undefined;
  Gallery: undefined;
};

/** Root stack navigator - used for navigating to FriendProfile from nested screens */
export type RootStackNavigationProp = NativeStackNavigationProp<RootStackParamList>;
