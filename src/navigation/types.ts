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
  Map: { latitude?: number; longitude?: number } | undefined;
  Feed: undefined;
  Upload: undefined;
  Friends: undefined;
  Profile: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  Gallery: undefined;
};
