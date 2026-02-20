import React, { useRef, useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  createBottomTabNavigator,
  BottomTabBar,
  type BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../lib/AuthContext';
import { CardStackProvider } from '../lib/CardStackContext';
import type { RootStackParamList, MainTabParamList, ProfileStackParamList } from './types';
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
  const scale = useRef(new Animated.Value(focused ? 1.1 : 1)).current;
  useEffect(() => {
    Animated.timing(scale, {
      toValue: focused ? 1.1 : 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [focused, scale]);
  const color = focused ? theme.colors.text : theme.colors.textTertiary;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Feather name={name} size={TAB_ICON_SIZE} color={color} />
    </Animated.View>
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
import { FeedScreen } from '../screens/FeedScreen';
import { UploadScreen } from '../screens/UploadScreen';
import { FriendsScreen } from '../screens/FriendsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { GalleryScreen } from '../screens/GalleryScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen name="Gallery" component={GalleryScreen} />
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
            borderTopColor: theme.colors.border,
            borderTopWidth: 1,
            height: 50 + insets.bottom,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarActiveTintColor: theme.colors.text,
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
          {({ route }) => <HomeScreen profile={profile} route={route} />}
        </Tab.Screen>
        <Tab.Screen
          name="Feed"
          component={FeedScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon name="activity" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Upload"
          component={UploadScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon name="plus-circle" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Friends"
          component={FriendsScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon name="users" focused={focused} />,
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
        {() => <MainTabs profile={profile as Profile} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

const TAB_BAR_HEIGHT = 50;

const styles = StyleSheet.create({
  tabBarContainer: {
    backgroundColor: theme.colors.background,
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
