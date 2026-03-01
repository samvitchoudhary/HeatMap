/**
 * navigation/types.ts
 *
 * TypeScript param lists for all navigators.
 *
 * Used by useNavigation, route.params, and navigate() for type-safe params.
 */

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  SignUp: undefined;
  ProfileSetup: undefined;
  MainTabs: undefined;
  FriendProfile: { userId: string };
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
      }
    | undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  Friends: undefined;
  Gallery: undefined;
};
