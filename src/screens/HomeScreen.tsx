import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Animated, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCardStack } from '../lib/CardStackContext';
import { DARK_MAP_STYLE, HEATMAP_GRADIENT } from '../lib/mapConfig';
import MapView, { Heatmap, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import type { Profile, PostWithProfile } from '../types';
import { CardStack } from '../components/CardStack';

type HomeScreenProps = {
  profile: Profile | null;
};

const NEARBY_RADIUS_METERS = 500;

function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function HomeScreen({ profile }: HomeScreenProps) {
  const { setCardStackOpen } = useCardStack();
  const [posts, setPosts] = useState<PostWithProfile[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [selectedPosts, setSelectedPosts] = useState<PostWithProfile[] | null>(null);
  const mapRef = useRef<MapView>(null);
  const hasCenteredOnUser = useRef(false);
  const loadingOpacity = useRef(new Animated.Value(1)).current;

  const fetchPosts = useCallback(async () => {
    const currentUserId = profile?.id;
    if (!currentUserId) {
      setPostsLoading(false);
      return;
    }
    setPostsLoading(true);
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)
      .eq('status', 'accepted');

    const friendIds =
      friendships?.map((f) =>
        f.requester_id === currentUserId ? f.addressee_id : f.requester_id
      ) ?? [];
    const allowedIds = [currentUserId, ...friendIds];

    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles(username, display_name, avatar_url)')
      .in('user_id', allowedIds)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching posts:', error);
      setPostsLoading(false);
      return;
    }
    setPosts((data ?? []) as PostWithProfile[]);
    setPostsLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    if (!postsLoading) {
      Animated.timing(loadingOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      loadingOpacity.setValue(1);
    }
  }, [postsLoading, loadingOpacity]);

  useFocusEffect(
    useCallback(() => {
      fetchPosts();
    }, [fetchPosts])
  );

  React.useEffect(() => {
    setCardStackOpen(selectedPosts !== null);
    return () => setCardStackOpen(false);
  }, [selectedPosts, setCardStackOpen]);

  React.useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'HeatMap needs your location to center the map and show where you and your friends have posted.',
        );
        return;
      }

      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const userRegion = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
        if (mapRef.current && !hasCenteredOnUser.current) {
          hasCenteredOnUser.current = true;
          mapRef.current.animateToRegion(userRegion, 500);
        }
      } catch (err) {
        console.error('Error getting location:', err);
      }
    })();
  }, []);

  function handleMapPress(event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    const nearby = posts.filter((post) => {
      const distance = getDistanceMeters(
        latitude,
        longitude,
        post.latitude,
        post.longitude
      );
      return distance <= NEARBY_RADIUS_METERS;
    });
    if (nearby.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const sorted = [...nearby].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setSelectedPosts(sorted);
    }
  }

  const heatmapPoints = posts.map((post) => ({
    latitude: post.latitude,
    longitude: post.longitude,
    weight: 1,
  }));

  const showEmptyState = !postsLoading && posts.length === 0;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        customMapStyle={DARK_MAP_STYLE}
        showsUserLocation={true}
        onPress={handleMapPress}
        initialRegion={{
          latitude: 37.78825,
          longitude: -122.4324,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {heatmapPoints.length > 0 && (
          <Heatmap
            points={heatmapPoints}
            radius={80}
            opacity={0.8}
            gradient={HEATMAP_GRADIENT}
          />
        )}
      </MapView>

      {postsLoading && (
        <Animated.View style={[styles.loadingBar, { opacity: loadingOpacity }]} pointerEvents="none">
          <View style={styles.loadingBarInner} />
        </Animated.View>
      )}

      {showEmptyState && (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Feather name="map-pin" size={40} color={theme.colors.textTertiary} />
          <Text style={styles.emptyTitle}>No posts yet</Text>
          <Text style={styles.emptySubtitle}>
            Upload your first photo or add friends to see their activity
          </Text>
        </View>
      )}

      {selectedPosts !== null && selectedPosts.length > 0 && (
        <CardStack posts={selectedPosts} onClose={() => setSelectedPosts(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
    width: '100%',
  },
  loadingBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 40,
    left: 24,
    right: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.surfaceLight,
    overflow: 'hidden',
  },
  loadingBarInner: {
    flex: 1,
    backgroundColor: theme.colors.textTertiary,
    borderRadius: 2,
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 10, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  emptySubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
});
