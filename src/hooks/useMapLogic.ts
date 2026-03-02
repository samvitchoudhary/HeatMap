/**
 * useMapLogic.ts
 *
 * Extracts map-related logic from HomeScreen: clustering, heatmap points,
 * search (Places API), region tracking, location permissions, FAB handlers.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Alert, Animated, Keyboard } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MapStackParamList } from '../navigation/types';
import { parseExifGps } from '../lib/exif';
import type { PostWithProfile } from '../types';
import { supabase } from '../lib/supabase';

/** Default map center - San Francisco area */
const INITIAL_MAP_REGION = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const GOOGLE_MAPS_API_KEY =
  Constants.expoConfig?.ios?.config?.googleMapsApiKey ||
  Constants.expoConfig?.android?.config?.googleMapsApiKey ||
  '';

const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  allowsEditing: true,
  quality: 0.7,
};

export type PlacePrediction = {
  placeId: string;
  name: string;
  description: string;
};

export type Cluster = {
  latitude: number;
  longitude: number;
  count: number;
  posts: PostWithProfile[];
};

/** Haversine distance in meters between two lat/lon points */
function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
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

export function clusterPosts(
  posts: PostWithProfile[],
  radiusMeters: number = 100
): Cluster[] {
  const clusters: Cluster[] = [];

  for (const post of posts) {
    let added = false;
    for (const cluster of clusters) {
      const dist = getDistanceMeters(
        post.latitude,
        post.longitude,
        cluster.latitude,
        cluster.longitude
      );
      if (dist < radiusMeters) {
        cluster.posts.push(post);
        cluster.count++;
        cluster.latitude =
          cluster.posts.reduce((sum, p) => sum + p.latitude, 0) / cluster.count;
        cluster.longitude =
          cluster.posts.reduce((sum, p) => sum + p.longitude, 0) / cluster.count;
        added = true;
        break;
      }
    }
    if (!added) {
      clusters.push({
        latitude: post.latitude,
        longitude: post.longitude,
        count: 1,
        posts: [post],
      });
    }
  }
  return clusters;
}

async function searchPlaces(query: string): Promise<PlacePrediction[]> {
  if (!query.trim() || !GOOGLE_MAPS_API_KEY) return [];
  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      if (__DEV__) console.error('Places API error:', data.status);
      return [];
    }
    return (data.predictions || []).map((prediction: any) => ({
      placeId: prediction.place_id,
      name: prediction.structured_formatting?.main_text || prediction.description,
      description:
        prediction.structured_formatting?.secondary_text || prediction.description,
    }));
  } catch (error) {
    if (__DEV__) console.error('Places API fetch error:', error);
    return [];
  }
}

async function getPlaceDetails(
  placeId: string
): Promise<{ latitude: number; longitude: number } | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== 'OK' || !data.result?.geometry?.location) {
      if (__DEV__) console.error('Place Details API error:', data.status);
      return null;
    }
    return {
      latitude: data.result.geometry.location.lat,
      longitude: data.result.geometry.location.lng,
    };
  } catch (error) {
    if (__DEV__) console.error('Place Details API fetch error:', error);
    return null;
  }
}

export function useMapLogic(
  posts: PostWithProfile[],
  mapRef: React.RefObject<any>,
    options: {
    friendIds: string[];
    profileId: string | undefined;
    fetchAllPosts: (friendIds: string[], userId: string) => Promise<void>;
    route?: { params?: { latitude?: number; longitude?: number; postId?: string; showComments?: boolean } };
    onDeepLinkResolved?: (post: PostWithProfile, showComments: boolean) => void;
  }
) {
  const navigation = useNavigation<NativeStackNavigationProp<MapStackParamList, 'Map'>>();
  const currentRegionRef = useRef(INITIAL_MAP_REGION);
  const hasCenteredOnUser = useRef(false);
  const hasInitiallyFetched = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<PlacePrediction[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const heatmapPoints = useMemo(
    () =>
      posts.map((post) => ({
        latitude: post.latitude,
        longitude: post.longitude,
        weight: 1,
      })),
    [posts]
  );

  const clusters = useMemo(() => clusterPosts(posts, 100), [posts]);
  const showBadges = (currentRegionRef.current?.latitudeDelta ?? 0.05) <= 0.5;

  const onRegionChangeComplete = useCallback((region: typeof INITIAL_MAP_REGION) => {
    currentRegionRef.current = region;
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchText.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      setShowDropdown(false);
      return;
    }
    setSearchLoading(true);
    setShowDropdown(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchPlaces(searchText);
      setSearchResults(results);
      setSearchLoading(false);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText]);

  const handleSelectPlace = useCallback(
    async (place: PlacePrediction) => {
      Keyboard.dismiss();
      setSearchText('');
      setShowDropdown(false);
      const coords = await getPlaceDetails(place.placeId);
      if (coords && mapRef.current) {
        mapRef.current.animateToRegion(
          {
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          1000
        );
      }
    },
    [mapRef]
  );

  const handleRecenter = useCallback(async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const userRegion = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      if (mapRef.current) {
        mapRef.current.animateToRegion(userRegion, 1000);
      }
    } catch (err) {
      if (__DEV__) console.error('Error getting location:', err);
    }
  }, [mapRef]);

  async function requestCameraPermission(): Promise<boolean> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera Permission Required',
        'HeatMap needs camera access to take photos. Please enable it in your device settings.',
      );
      return false;
    }
    return true;
  }

  async function requestMediaLibraryPermission(): Promise<boolean> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Photo Library Permission Required',
        'HeatMap needs access to your photo library to choose photos. Please enable it in your device settings.',
      );
      return false;
    }
    return true;
  }

  const handleFabCamera = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;
    const result = await ImagePicker.launchCameraAsync(IMAGE_OPTIONS);
    if (result.canceled) return;
    if (result.assets[0]) {
      const asset = result.assets[0];
      const exif = asset.exif as Record<string, unknown> | undefined;
      const exifLocation = parseExifGps(exif) ?? null;
      navigation.navigate('Upload', { imageUri: asset.uri, exifLocation });
    }
  }, [navigation]);

  const handleFabGallery = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const hasPermission = await requestMediaLibraryPermission();
    if (!hasPermission) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      ...IMAGE_OPTIONS,
      mediaTypes: ['images'],
      exif: true,
    });
    if (result.canceled) return;
    if (result.assets[0]) {
      const asset = result.assets[0];
      const exif = asset.exif as Record<string, unknown> | undefined;
      const exifLocation = parseExifGps(exif) ?? null;
      navigation.navigate('Upload', { imageUri: asset.uri, exifLocation });
    }
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const currentUserId = options.profileId;
      if (!currentUserId) return;
      hasInitiallyFetched.current = true;
      options.fetchAllPosts(options.friendIds, currentUserId);
    }, [
      options.profileId,
      options.friendIds,
      options.fetchAllPosts,
    ])
  );

  useEffect(() => {
    if (options.profileId && options.friendIds.length > 0) {
      options.fetchAllPosts(options.friendIds, options.profileId);
    }
  }, [options.profileId, options.friendIds, options.fetchAllPosts]);

  useEffect(() => {
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
        if (__DEV__) console.error('Error getting location:', err);
      }
    })();
  }, [mapRef]);

  useFocusEffect(
    useCallback(() => {
      const params = options.route?.params;
      const lat = params?.latitude;
      const lng = params?.longitude;
      const postId = params?.postId;
      const showComments = params?.showComments;

      if (postId && typeof lat === 'number' && typeof lng === 'number') {
        (async () => {
          try {
            const { data } = await supabase
              .from('posts')
              .select('*, profiles:user_id(username, display_name, avatar_url)')
              .eq('id', postId)
              .single();
            if (data && mapRef.current) {
              const post = data as PostWithProfile;
              mapRef.current.animateToRegion(
                {
                  latitude: lat,
                  longitude: lng,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                },
                1000
              );
              options.onDeepLinkResolved?.(post, !!showComments);
            }
          } catch (err) {
            if (__DEV__) console.error('Failed to fetch post for deep link:', err);
          }
          (navigation as { setParams: (p: object) => void }).setParams({
            latitude: undefined,
            longitude: undefined,
            postId: undefined,
            showComments: undefined,
          });
        })();
        return;
      }

      if (typeof lat === 'number' && typeof lng === 'number' && mapRef.current) {
        mapRef.current.animateToRegion(
          { latitude: lat, longitude: lng, latitudeDelta: 0.005, longitudeDelta: 0.005 },
          1000
        );
        (navigation as { setParams: (p: object) => void }).setParams({
          latitude: undefined,
          longitude: undefined,
        });
      }
    }, [
      options.route?.params?.latitude,
      options.route?.params?.longitude,
      options.route?.params?.postId,
      options.route?.params?.showComments,
      navigation,
      mapRef,
    ])
  );

  return {
    heatmapPoints,
    clusters,
    showBadges,
    currentRegionRef,
    onRegionChangeComplete,
    searchText,
    setSearchText,
    searchResults,
    searchLoading,
    showDropdown,
    setShowDropdown,
    handleSelectPlace,
    handleRecenter,
    handleFabCamera,
    handleFabGallery,
    getDistanceMeters,
    INITIAL_MAP_REGION,
  };
}
