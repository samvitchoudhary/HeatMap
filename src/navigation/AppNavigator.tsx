import React, { useRef } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  createBottomTabNavigator,
  BottomTabBar,
  type BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../lib/AuthContext';
import { CardStackProvider } from '../lib/CardStackContext';
import type { RootStackParamList, MainTabParamList, ProfileStackParamList } from './types';
import type { Profile } from '../types';
import { theme } from '../lib/theme';
import { TabSwipeOverlay } from '../components/TabSwipeOverlay';

function AnimatedTabButton(
  props: { children: React.ReactNode; onPress?: () => void; [key: string]: unknown }
) {
  const { children, onPress, ...rest } = props;
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <TouchableOpacity
      {...rest}
      onPress={() => {
        Animated.sequence([
          Animated.spring(scale, { toValue: 1.15, useNativeDriver: true, speed: 100, bounciness: 4 }),
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 100, bounciness: 4 }),
        ]).start();
        onPress?.();
      }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </TouchableOpacity>
  );
}
import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { HomeScreen } from '../screens/HomeScreen';
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
  return (
    <CardStackProvider>
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.colors.background,
            borderTopColor: theme.colors.border,
            borderTopWidth: 1,
            height: 60,
          },
          tabBarActiveTintColor: theme.colors.text,
          tabBarInactiveTintColor: theme.colors.textTertiary,
          tabBarShowLabel: false,
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      >
        <Tab.Screen
          name="Map"
          options={{
            tabBarIcon: ({ color, size }) => <Feather name="map" size={size ?? 24} color={color} />,
          }}
        >
          {() => <HomeScreen profile={profile} />}
        </Tab.Screen>
        <Tab.Screen
          name="Upload"
          component={UploadScreen}
          options={{
            tabBarIcon: ({ color, size }) => <Feather name="plus-circle" size={size ?? 24} color={color} />,
          }}
        />
        <Tab.Screen
        name="Friends"
        component={FriendsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="users" size={size ?? 24} color={color} />,
        }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileStackNavigator}
          options={{
            tabBarIcon: ({ color, size }) => <Feather name="user" size={size ?? 24} color={color} />,
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
        <ActivityIndicator size="large" color="#FFF" />
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

const TAB_BAR_HEIGHT = 60;

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
