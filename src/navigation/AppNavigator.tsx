/**
 * AppNavigator.tsx
 *
 * Root navigation structure for HeatMap.
 *
 * Key responsibilities:
 * - Auth flow: Login, SignUp, ProfileSetup
 * - MainTabs (Material Top Tabs): Map, Feed, Notifications, Profile
 * - Map tab = MapStack (Map + Upload); Profile tab = ProfileStack (Profile, Friends, Gallery)
 * - Custom tab bar with icons; TabSwipeOverlay for edge-swipe between tabs
 * - Wraps app in Auth, Notification, FeedBadge, CardStack, Toast providers
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NotificationProvider, useNotifications } from '../lib/NotificationContext';
import { FeedBadgeProvider, useFeedBadge } from '../lib/FeedBadgeContext';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet, useWindowDimensions, Text, Animated, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../lib/AuthContext';
import { CardStackProvider } from '../lib/CardStackContext';
import type { RootStackParamList, MainTabParamList, MapStackParamList, ProfileStackParamList } from './types';
import type { Profile } from '../types';
import { theme } from '../lib/theme';

const TAB_ICON_SIZE = 24;

/** Tab bar icon - Feather icon with active/inactive color */
function TabIcon({
  name,
  focused,
}: {
  name: React.ComponentProps<typeof Feather>['name'];
  focused: boolean;
}) {
  const color = focused ? theme.colors.tabActive : theme.colors.tabInactive;
  return (
    <View style={styles.tabIconWrap}>
      <Feather name={name} size={TAB_ICON_SIZE} color={color} />
    </View>
  );
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
const Tab = createMaterialTopTabNavigator<MainTabParamList>();
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

/** Map tab stack: Map (HomeScreen) and Upload */
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

/** Profile tab stack: Profile, Friends, Gallery */
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

/** Custom tab bar with icons, badge dots (Feed, Notifications), sliding indicator */
function CustomTabBar(props: {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: any;
  descriptors: any;
  position?: Animated.AnimatedNode;
}) {
  const { state, navigation, position } = props;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tabWidth = width / 4;
  const { unreadCount } = useNotifications();
  const { hasNewPosts } = useFeedBadge();

  const tabConfig: { name: keyof MainTabParamList; icon: React.ComponentProps<typeof Feather>['name']; badge?: string | number }[] = [
    { name: 'Map', icon: 'map' },
    { name: 'Feed', icon: 'activity', badge: hasNewPosts ? '' : undefined },
    { name: 'Notifications', icon: 'bell', badge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined },
    { name: 'Profile', icon: 'user' },
  ];

  const indicatorTranslateX =
    position != null
      ? Animated.multiply(position as Animated.Animated, tabWidth)
      : state.index * tabWidth;

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom, height: 50 + insets.bottom }]}>
      <View style={styles.tabBarRow}>
        {state.routes.map((route, index) => {
          const config = tabConfig[index];
          const isFocused = state.index === index;
          const onPress = () => {
            Keyboard.dismiss();
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, (route as { params?: object }).params);
            }
          };
          const badge = config?.name === 'Feed' && hasNewPosts
            ? ''
            : config?.name === 'Notifications' && unreadCount > 0
            ? (unreadCount > 9 ? '9+' : unreadCount)
            : undefined;
          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.7}
              style={styles.tabButton}
            >
              <TabIcon name={config?.icon ?? 'circle'} focused={isFocused} />
              {badge !== undefined && (
                <View
                  style={[
                    styles.badge,
                    typeof badge === 'string' && badge === ''
                      ? styles.badgeDot
                      : undefined,
                  ]}
                >
                  {badge !== '' && (
                    <Text style={styles.badgeText}>{badge}</Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.indicatorContainer}>
        <Animated.View
          style={[
            styles.indicator,
            {
              width: tabWidth,
              transform: [{ translateX: indicatorTranslateX }],
            },
          ]}
        />
      </View>
    </View>
  );
}

/** Main tab navigator - Map, Feed, Notifications, Profile */
function MainTabs({ profile }: { profile: Profile }) {
  const insets = useSafeAreaInsets();

  return (
    <CardStackProvider>
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        tabBarPosition="bottom"
        screenOptions={{
          tabBarShowLabel: false,
          tabBarShowIcon: true,
          tabBarActiveTintColor: theme.colors.tabActive,
          tabBarInactiveTintColor: theme.colors.tabInactive,
          lazy: false,
        }}
      >
        <Tab.Screen
          name="Map"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon name="map" focused={focused} />,
            // Disable swiping only when on Map tab (page 0); user must tap tab icons to navigate away
            swipeEnabled: false,
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
            <FeedBadgeProvider>
              <MainTabs profile={profile as Profile} />
            </FeedBadgeProvider>
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

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background,
    borderTopColor: theme.colors.borderLight,
    borderTopWidth: 1,
  },
  tabBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 50,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.primary,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: '50%',
    marginRight: -20,
    backgroundColor: theme.colors.primary,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    minWidth: 8,
    maxWidth: 8,
    height: 8,
    borderRadius: 4,
    marginRight: -16,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
});
