import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NotificationProvider, useNotifications } from '../lib/NotificationContext';
import {
  createBottomTabNavigator,
  BottomTabBar,
  type BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../lib/AuthContext';
import { CardStackProvider } from '../lib/CardStackContext';
import type { RootStackParamList, MainTabParamList, MapStackParamList, ProfileStackParamList } from './types';
import type { Profile } from '../types';
import { theme } from '../lib/theme';
import { TabSwipeOverlay } from '../components/TabSwipeOverlay';

const TAB_ICON_SIZE = 24;

function TabIcon({
  name,
  focused,
}: {
  name: React.ComponentProps<typeof Feather>['name'];
  focused: boolean;
}) {
  const color = focused ? theme.colors.primary : theme.colors.textTertiary;
  return (
    <View style={styles.tabIconWrap}>
      <Feather name={name} size={TAB_ICON_SIZE} color={color} />
      {focused && <View style={styles.tabIndicator} />}
    </View>
  );
}

function AnimatedTabButton(
  props: { children: React.ReactNode; onPress?: () => void; [key: string]: unknown }
) {
  const { children, onPress, ...rest } = props;
  return <TouchableOpacity {...rest} onPress={onPress} activeOpacity={0.7}>{children}</TouchableOpacity>;
}
import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { UploadScreen } from '../screens/UploadScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { FriendsScreen } from '../screens/FriendsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { GalleryScreen } from '../screens/GalleryScreen';
import { FriendProfileScreen } from '../screens/FriendProfileScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const MapStack = createNativeStackNavigator<MapStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

const headerScreenOptions = {
  headerStyle: {
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  headerTintColor: theme.colors.text,
  headerTitleStyle: { fontWeight: '600' as const },
  headerShadowVisible: false,
};

function MapStackNavigator({
  profile,
  initialMapParams,
}: {
  profile: Profile;
  initialMapParams?: {
    latitude?: number;
    longitude?: number;
    postId?: string;
    showComments?: boolean;
  };
}) {
  return (
    <MapStack.Navigator
      screenOptions={{ headerShown: false, animation: 'none' }}
      initialRouteName="Map"
    >
      <MapStack.Screen
        name="Map"
        options={{ animation: 'none' }}
      >
        {() => <HomeScreen profile={profile} route={{ params: initialMapParams } as any} />}
      </MapStack.Screen>
      <MapStack.Screen
        name="Upload"
        component={UploadScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </MapStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        ...headerScreenOptions,
        headerShown: false,
      }}
    >
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen
        name="Friends"
        component={FriendsScreen}
        options={{
          headerShown: true,
          headerTitle: 'Friends',
        }}
      />
      <ProfileStack.Screen
        name="Gallery"
        component={GalleryScreen}
        options={{
          headerShown: true,
          headerTitle: 'All Posts',
        }}
      />
    </ProfileStack.Navigator>
  );
}

function CustomTabBar(props: React.ComponentProps<typeof BottomTabBar>) {
  return (
    <View style={styles.tabBarContainer}>
      <View style={styles.swipeOverlayContainer} pointerEvents="box-none">
        <TabSwipeOverlay
          navigation={props.navigation as unknown as BottomTabNavigationProp<MainTabParamList>}
          state={props.state}
        />
      </View>
      <BottomTabBar {...props} />
    </View>
  );
}

function MainTabs({ profile }: { profile: Profile }) {
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotifications();
  return (
    <CardStackProvider>
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme.colors.background,
            borderTopColor: theme.colors.borderLight,
            borderTopWidth: 1,
            height: 50 + insets.bottom,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textTertiary,
          tabBarShowLabel: false,
          tabBarIconStyle: { marginBottom: 0 },
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      >
        <Tab.Screen
          name="Map"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon name="map" focused={focused} />,
          }}
        >
          {({ route }) => (
            <MapStackNavigator profile={profile} initialMapParams={route.params} />
          )}
        </Tab.Screen>
        <Tab.Screen
          name="Feed"
          component={FeedScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon name="activity" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon name="bell" focused={focused} />,
            tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined,
            tabBarBadgeStyle: {
              backgroundColor: theme.colors.primary,
              color: '#FFF',
              fontSize: 11,
              minWidth: 18,
              height: 18,
            },
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileStackNavigator}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon name="user" focused={focused} />,
          }}
        />
      </Tab.Navigator>
    </CardStackProvider>
  );
}

export function AppNavigator() {
  const { session, profile, loading } = useAuth();

  if (loading || (session?.user?.id && profile === undefined)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.colors.text} />
      </View>
    );
  }

  if (!session) {
    return (
      <Stack.Navigator
        screenOptions={{ headerShown: false, animation: 'none' }}
        initialRouteName="Login"
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
      </Stack.Navigator>
    );
  }

  if (!profile) {
    return (
      <Stack.Navigator
        screenOptions={{ headerShown: false, animation: 'none' }}
        initialRouteName="ProfileSetup"
      >
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, animation: 'none' }}
      initialRouteName="MainTabs"
    >
      <Stack.Screen name="MainTabs">
        {() => (
          <NotificationProvider>
            <MainTabs profile={profile as Profile} />
          </NotificationProvider>
        )}
      </Stack.Screen>
      <Stack.Screen
        name="FriendProfile"
        component={FriendProfileScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}

const TAB_BAR_HEIGHT = 50;

const styles = StyleSheet.create({
  tabBarContainer: {
    backgroundColor: theme.colors.background,
  },
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: -8,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
  swipeOverlayContainer: {
    position: 'absolute',
    top: -10000,
    left: 0,
    right: 0,
    height: 10000 + TAB_BAR_HEIGHT,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
});
