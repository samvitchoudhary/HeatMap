/**
 * HomeScreen.tsx
 *
 * Map tab - heatmap, clusters, search, FAB for camera/gallery.
 *
 * Key responsibilities:
 * - Renders MapView with Heatmap (post density) and cluster Markers
 * - Tap map to show nearby posts in dropdown; tap cluster/pin to open CardStack
 * - Search bar with Google Places autocomplete
 * - FAB: camera or gallery picker → UploadScreen with location from EXIF or search
 * - Fetches posts from friends; 30s throttle on refetch
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Animated,
  Platform,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCardStack } from '../lib/CardStackContext';
import type { MapStackParamList, RootStackNavigationProp } from '../navigation/types';
import { parseExifGps } from '../lib/exif';
import { HEATMAP_RADIUS, HEATMAP_OPACITY } from '../lib/mapConfig';
import { getCategoryByKey } from '../lib/categories';
import MapView, { Heatmap, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import { useFriends, usePosts } from '../hooks';
import type { Profile, PostWithProfile } from '../types';
import { CardStack } from '../components/CardStack';
import { StyledTextInput } from '../components/StyledTextInput';

type HomeScreenProps = {
  profile: Profile | null;
  route?: RouteProp<MapStackParamList, 'Map'>;
};

const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  allowsEditing: true,
  quality: 0.7,
};

/** Max distance (m) for "nearby" posts when tapping map */
const NEARBY_RADIUS_METERS = 100;

/** Only show cluster badges when zoomed out very far (city/state/country level) */
const CLUSTER_MIN_ZOOM = 0.5;

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

const LIGHT_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f2f2f2' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#555555' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#aaaaaa' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#e8e8e8' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#666666' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#b8e6a3' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#4a8c3f' }] },
  { featureType: 'poi.sports_complex', elementType: 'geometry', stylers: [{ color: '#c5e8b0' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.government', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#d4edca' }] },
  { featureType: 'landscape.natural.terrain', elementType: 'geometry', stylers: [{ color: '#cce8bf' }] },
  { featureType: 'landscape.natural.landcover', elementType: 'geometry', stylers: [{ color: '#d4edca' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e0e0e0' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e0e0e0' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#7ebbe6' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a90b8' }] },
];

type PlacePrediction = {
  placeId: string;
  name: string;
  description: string;
};

/** Haversine distance in meters between two lat/lon points */
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

type Cluster = {
  coordinate: { latitude: number; longitude: number };
  count: number;
  postIds: string[];
  posts: PostWithProfile[];
};

/**
 * Grid-based spatial clustering — each post counted exactly once.
 */
function clusterPosts(posts: PostWithProfile[], clusterRadius: number): Cluster[] {
  if (posts.length === 0) return [];

  const cellSize = clusterRadius;
  const grid: Record<
    string,
    { latSum: number; lngSum: number; posts: PostWithProfile[] }
  > = {};

  for (const post of posts) {
    const cellX = Math.floor(post.latitude / cellSize);
    const cellY = Math.floor(post.longitude / cellSize);
    const key = `${cellX},${cellY}`;

    if (!grid[key]) {
      grid[key] = { latSum: 0, lngSum: 0, posts: [] };
    }

    grid[key].latSum += post.latitude;
    grid[key].lngSum += post.longitude;
    grid[key].posts.push(post);
  }

  return Object.values(grid).map((cell) => ({
    coordinate: {
      latitude: cell.latSum / cell.posts.length,
      longitude: cell.lngSum / cell.posts.length,
    },
    count: cell.posts.length,
    postIds: cell.posts.map((p) => p.id),
    posts: cell.posts,
  }));
}

function getClusterSize(count: number): number {
  if (count <= 5) return 36;
  if (count <= 20) return 44;
  if (count <= 50) return 52;
  return 60;
}

export function HomeScreen({ profile, route }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MapStackParamList, 'Map'>>();
  const { cardStackOpen, setCardStackOpen } = useCardStack();
  const { friendIds, loading: friendsLoading } = useFriends();
  const { posts, loading: postsLoading, fetchAllPosts, removePost } = usePosts();
  const [selectedPosts, setSelectedPosts] = useState<PostWithProfile[] | null>(null);
  const [selectedInitialIndex, setSelectedInitialIndex] = useState(0);
  const [openWithCommentsPostId, setOpenWithCommentsPostId] = useState<string | null>(null);
  const currentRegionRef = useRef(INITIAL_MAP_REGION);
  const [currentZoom, setCurrentZoom] = useState(INITIAL_MAP_REGION.latitudeDelta);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<PlacePrediction[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const mapRef = useRef<MapView>(null);
  const hasCenteredOnUser = useRef(false);
  const loadingOpacity = useRef(new Animated.Value(1)).current;
  const dropdownOpacity = useRef(new Animated.Value(0)).current;
  const dropdownTranslateY = useRef(new Animated.Value(-12)).current;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasInitiallyFetched = useRef(false);

  const [fabExpanded, setFabExpanded] = useState(false);
  const fabIconRotate = useRef(new Animated.Value(0)).current;
  const fabOverlayOpacity = useRef(new Animated.Value(0)).current;
  const fabCameraTranslateY = useRef(new Animated.Value(0)).current;
  const fabCameraOpacity = useRef(new Animated.Value(0)).current;
  const fabCameraScale = useRef(new Animated.Value(0.5)).current;
  const fabGalleryTranslateY = useRef(new Animated.Value(0)).current;
  const fabGalleryOpacity = useRef(new Animated.Value(0)).current;
  const fabGalleryScale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loading = friendsLoading || postsLoading;
    if (!loading) {
      Animated.timing(loadingOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      loadingOpacity.setValue(1);
    }
  }, [friendsLoading, postsLoading, loadingOpacity]);

  useEffect(() => {
    if (showDropdown) {
      Animated.parallel([
        Animated.timing(dropdownOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(dropdownTranslateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(dropdownOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(dropdownTranslateY, {
          toValue: -12,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showDropdown, dropdownOpacity, dropdownTranslateY]);

  const runOpenAnimation = useCallback(() => {
    Animated.parallel([
      Animated.timing(fabIconRotate, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(fabOverlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(fabCameraTranslateY, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(fabCameraOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(fabCameraScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.spring(fabGalleryTranslateY, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(fabGalleryOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(fabGalleryScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();
  }, [
    fabIconRotate,
    fabOverlayOpacity,
    fabCameraTranslateY,
    fabCameraOpacity,
    fabCameraScale,
    fabGalleryTranslateY,
    fabGalleryOpacity,
    fabGalleryScale,
  ]);

  const resetFabToClosed = useCallback(() => {
    // Stop any running animations first
    fabIconRotate.stopAnimation();
    fabOverlayOpacity.stopAnimation();
    fabCameraTranslateY.stopAnimation();
    fabCameraOpacity.stopAnimation();
    fabCameraScale.stopAnimation();
    fabGalleryTranslateY.stopAnimation();
    fabGalleryOpacity.stopAnimation();
    fabGalleryScale.stopAnimation();

    // Then reset all values
    setFabExpanded(false);
    fabIconRotate.setValue(0);
    fabOverlayOpacity.setValue(0);
    fabCameraTranslateY.setValue(0);
    fabCameraOpacity.setValue(0);
    fabCameraScale.setValue(0.5);
    fabGalleryTranslateY.setValue(0);
    fabGalleryOpacity.setValue(0);
    fabGalleryScale.setValue(0.5);
  }, [
    fabIconRotate,
    fabOverlayOpacity,
    fabCameraTranslateY,
    fabCameraOpacity,
    fabCameraScale,
    fabGalleryTranslateY,
    fabGalleryOpacity,
    fabGalleryScale,
  ]);

  const runCloseAnimation = useCallback(
    (onComplete?: () => void) => {
      Animated.parallel([
        Animated.timing(fabIconRotate, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fabOverlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fabCameraTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fabCameraOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fabCameraScale, { toValue: 0.5, duration: 200, useNativeDriver: true }),
        Animated.timing(fabGalleryTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fabGalleryOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fabGalleryScale, { toValue: 0.5, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        setFabExpanded(false);
        onComplete?.();
      });
    },
    [
      fabIconRotate,
      fabOverlayOpacity,
      fabCameraTranslateY,
      fabCameraOpacity,
      fabCameraScale,
      fabGalleryTranslateY,
      fabGalleryOpacity,
      fabGalleryScale,
    ]
  );

  useEffect(() => {
    if (fabExpanded) {
      runOpenAnimation();
    }
  }, [fabExpanded, runOpenAnimation]);

  const handleFabToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (fabExpanded) {
      runCloseAnimation();
    } else {
      setFabExpanded(true);
    }
  }, [fabExpanded, runCloseAnimation]);

  const handleFabOverlayPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    runCloseAnimation();
  }, [runCloseAnimation]);

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
    resetFabToClosed();

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
  }, [navigation, resetFabToClosed]);

  const handleFabGallery = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetFabToClosed();

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
  }, [navigation, resetFabToClosed]);

  const heatmapsByCategory = useMemo(() => {
    const groups: Record<string, { points: { latitude: number; longitude: number; weight: number }[]; color: string }> = {};

    for (const post of posts) {
      const point = { latitude: post.latitude, longitude: post.longitude, weight: 1 };
      const cat = getCategoryByKey(post.category ?? 'misc');
      const key = cat?.key ?? 'misc';
      const heatmapColor = cat?.heatmapColor ?? 'rgba(255,45,85,0.8)';
      if (!groups[key]) {
        groups[key] = { points: [], color: heatmapColor };
      }
      groups[key].points.push(point);
    }

    return groups;
  }, [posts]);

  const clusters = useMemo(() => {
    if (currentZoom < CLUSTER_MIN_ZOOM) return [];
    const radius = currentZoom * 0.2;
    return clusterPosts(posts, radius);
  }, [posts, currentZoom]);

  useEffect(() => {
    if (__DEV__ && clusters.length > 0) {
      console.log(
        'Clusters:',
        clusters.map((c) => ({
          lat: c.coordinate.latitude.toFixed(3),
          lng: c.coordinate.longitude.toFixed(3),
          count: c.count,
        }))
      );
    }
  }, [clusters]);

  const onRegionChangeComplete = useCallback((region: typeof INITIAL_MAP_REGION) => {
    currentRegionRef.current = region;
    setCurrentZoom(region.latitudeDelta);
  }, []);

  const handleClusterPress = useCallback((cluster: Cluster) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentZoom > 0.1) {
      mapRef.current?.animateToRegion(
        {
          latitude: cluster.coordinate.latitude,
          longitude: cluster.coordinate.longitude,
          latitudeDelta: currentZoom * 0.3,
          longitudeDelta: currentZoom * 0.3,
        },
        300
      );
    } else {
      const sorted = [...cluster.posts].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setSelectedInitialIndex(0);
      setSelectedPosts(sorted);
    }
  }, [currentZoom]);

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
      type PlacesPrediction = {
        place_id?: string;
        description?: string;
        structured_formatting?: { main_text?: string; secondary_text?: string };
      };
      return ((data.predictions as PlacesPrediction[]) || []).map((prediction) => ({
        placeId: prediction.place_id ?? '',
        name: prediction.structured_formatting?.main_text ?? prediction.description ?? '',
        description: prediction.structured_formatting?.secondary_text ?? prediction.description ?? '',
      }));
    } catch (error) {
      if (__DEV__) console.error('Places API fetch error:', error);
      return [];
    }
  }

  async function getPlaceDetails(placeId: string): Promise<{ latitude: number; longitude: number } | null> {
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

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
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

  const handleSelectPlace = useCallback(async (place: PlacePrediction) => {
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
  }, []);

  const handleMapPress = useCallback(
    (event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
      Keyboard.dismiss();
      if (showDropdown) {
        setShowDropdown(false);
        return;
      }
      const { latitude, longitude } = event.nativeEvent.coordinate;
      const radius = Math.max(
        50,
        Math.min(500, (currentRegionRef.current?.latitudeDelta ?? 0.05) * 111000 * 0.05)
      );
      const nearby = posts.filter((post) => {
        const distance = getDistanceMeters(
          latitude,
          longitude,
          post.latitude,
          post.longitude
        );
        return distance <= radius;
      });
      if (nearby.length > 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const sorted = [...nearby].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setSelectedInitialIndex(0);
        setSelectedPosts(sorted);
      }
    },
    [posts, showDropdown]
  );

  useFocusEffect(
    useCallback(() => {
      const currentUserId = profile?.id;
      if (!currentUserId) return;
      hasInitiallyFetched.current = true;
      fetchAllPosts(friendIds, currentUserId);
    }, [profile?.id, friendIds, fetchAllPosts])
  );

  useEffect(() => {
    if (profile?.id && friendIds.length > 0) {
      fetchAllPosts(friendIds, profile.id);
    }
  }, [profile?.id, friendIds, fetchAllPosts]);

  useFocusEffect(
    useCallback(() => {
      resetFabToClosed();
      return () => {
        resetFabToClosed();
      };
    }, [resetFabToClosed])
  );

  React.useEffect(() => {
    setCardStackOpen(selectedPosts !== null);
    return () => setCardStackOpen(false);
  }, [selectedPosts, setCardStackOpen]);

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
  }, []);

  useFocusEffect(
    useCallback(() => {
      const params = route?.params;
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
              { latitude: lat, longitude: lng, latitudeDelta: 0.005, longitudeDelta: 0.005 },
              1000
            );
            setSelectedInitialIndex(0);
            setSelectedPosts([post]);
            setOpenWithCommentsPostId(showComments ? postId : null);
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
      route?.params?.latitude,
      route?.params?.longitude,
      route?.params?.postId,
      route?.params?.showComments,
      navigation,
    ])
  );

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
        if (__DEV__) console.error('Error getting location:', err);
      }
    })();
  }, []);


  const showEmptyState = !postsLoading && posts.length === 0;
  const showSearchBar = selectedPosts === null;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        customMapStyle={LIGHT_MAP_STYLE}
        showsUserLocation={true}
        onPress={handleMapPress}
        onRegionChangeComplete={onRegionChangeComplete}
        initialRegion={INITIAL_MAP_REGION}
      >
        {currentZoom < CLUSTER_MIN_ZOOM &&
          Object.entries(heatmapsByCategory).map(([key, group]) => {
            if (group.points.length === 0) return null;
            const baseColor = group.color;
            const lightColor = baseColor.replace(/[\d.]+\)$/, '0.3)');
            const medColor = baseColor.replace(/[\d.]+\)$/, '0.5)');
            return (
              <Heatmap
                key={key}
                points={group.points}
                radius={HEATMAP_RADIUS}
                opacity={HEATMAP_OPACITY}
                gradient={{
                  colors: ['transparent', lightColor, medColor, baseColor, baseColor],
                  startPoints: [0.01, 0.05, 0.1, 0.3, 0.5],
                  colorMapSize: 256,
                }}
              />
            );
          })}
        {currentZoom >= CLUSTER_MIN_ZOOM &&
          clusters.map((cluster, i) => {
            const size = getClusterSize(cluster.count);
            return (
              <Marker
                key={`cluster-${i}`}
                coordinate={cluster.coordinate}
                onPress={() => handleClusterPress(cluster)}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View
                  style={[
                    styles.clusterBadge,
                    {
                      width: size,
                      height: size,
                      borderRadius: size / 2,
                    },
                  ]}
                >
                  <Text style={[styles.clusterBadgeText, { fontSize: cluster.count > 99 ? 12 : 14 }]}>
                    {cluster.count > 99 ? '99+' : cluster.count}
                  </Text>
                </View>
              </Marker>
            );
          })}
      </MapView>

      {showSearchBar && (
        <>
          <View style={[styles.searchBarContainer, { top: insets.top + 12 }]} pointerEvents="box-none">
            <View style={styles.searchBar}>
              <Feather name="search" size={18} color={theme.colors.textTertiary} style={styles.searchIcon} />
              <StyledTextInput
                embedded
                style={styles.searchInput}
                placeholder="Search a location..."
                value={searchText}
                onChangeText={setSearchText}
                onFocus={() => {
                  setSearchFocused(true);
                  searchText.trim() && setShowDropdown(true);
                }}
                onBlur={() => setSearchFocused(false)}
                returnKeyType="search"
              />
              {searchText.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setSearchText('');
                    setShowDropdown(false);
                    Keyboard.dismiss();
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {showDropdown && (
              <>
                <Pressable
                  style={styles.dropdownBackdrop}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowDropdown(false);
                  }}
                />
                <Animated.View
                  style={[
                    styles.dropdown,
                    {
                      opacity: dropdownOpacity,
                      transform: [{ translateY: dropdownTranslateY }],
                    },
                  ]}
                  onStartShouldSetResponder={() => true}
                >
                  {searchLoading ? (
                    <View style={styles.dropdownLoading}>
                      <ActivityIndicator size="small" color={theme.colors.text} />
                    </View>
                  ) : searchResults.length === 0 ? (
                    <View style={styles.dropdownEmpty}>
                      <Text style={styles.dropdownEmptyText}>No results found</Text>
                    </View>
                  ) : (
                    <ScrollView
                      style={styles.dropdownScroll}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                      overScrollMode="never"
                    >
                      {searchResults.map((place) => (
                        <TouchableOpacity
                          key={place.placeId}
                          style={styles.dropdownItem}
                          onPress={() => handleSelectPlace(place)}
                          activeOpacity={0.7}
                        >
                          <Feather name="map-pin" size={16} color={theme.colors.textSecondary} />
                          <View style={styles.dropdownItemText}>
                            <Text style={styles.dropdownItemName}>{place.name}</Text>
                            {place.description && (
                              <Text style={styles.dropdownItemDesc}>{place.description}</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </Animated.View>
              </>
            )}
          </View>
        </>
      )}

      {showSearchBar && (
        <TouchableOpacity
          style={[styles.recenterButton, { bottom: insets.bottom + 90 }]}
          onPress={handleRecenter}
          activeOpacity={0.8}
        >
          <Feather name="navigation" size={20} color={theme.colors.primary} />
        </TouchableOpacity>
      )}

      {!cardStackOpen && showSearchBar && (
        <View style={[StyleSheet.absoluteFill, styles.fabRoot]} pointerEvents="box-none">
          {fabExpanded && (
            <Pressable
              style={[StyleSheet.absoluteFill, styles.fabOverlayPressable]}
              onPress={handleFabOverlayPress}
            >
              <Animated.View
                style={[
                  styles.fabOverlay,
                  {
                    opacity: fabOverlayOpacity.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 1],
                    }),
                  },
                ]}
                pointerEvents="none"
              />
            </Pressable>
          )}

          <View style={[styles.fabContainer, { bottom: insets.bottom + 90 }]}>
          <Animated.View
            style={[
              styles.fabSubButtonWrap,
              {
                transform: [
                  {
                    translateY: fabCameraTranslateY.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -128],
                    }),
                  },
                  { scale: fabCameraScale },
                ],
                opacity: fabCameraOpacity,
              },
            ]}
            pointerEvents={fabExpanded ? 'auto' : 'none'}
          >
            <TouchableOpacity
              style={styles.fabSubButton}
              onPress={handleFabCamera}
              activeOpacity={0.7}
            >
              <Feather name="camera" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View
            style={[
              styles.fabSubButtonWrap,
              {
                transform: [
                  {
                    translateY: fabGalleryTranslateY.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -68],
                    }),
                  },
                  { scale: fabGalleryScale },
                ],
                opacity: fabGalleryOpacity,
              },
            ]}
            pointerEvents={fabExpanded ? 'auto' : 'none'}
          >
            <TouchableOpacity
              style={styles.fabSubButton}
              onPress={handleFabGallery}
              activeOpacity={0.7}
            >
              <Feather name="image" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={[styles.fabButton, theme.shadows.button as object]}
            onPress={handleFabToggle}
            activeOpacity={0.8}
          >
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: fabIconRotate.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '45deg'],
                    }),
                  },
                ],
              }}
            >
              <Feather name="plus" size={24} color="#FFF" />
            </Animated.View>
          </TouchableOpacity>
          </View>
        </View>
      )}

      {postsLoading && (
        <Animated.View style={[styles.loadingBar, { opacity: loadingOpacity }]} pointerEvents="none">
          <View style={styles.loadingBarInner} />
        </Animated.View>
      )}

      {showEmptyState && (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Feather name="map-pin" size={40} color={theme.colors.primary} />
          <Text style={styles.emptyTitle}>No posts yet</Text>
          <Text style={styles.emptySubtitle}>
            Upload your first photo or add friends to see their activity
          </Text>
        </View>
      )}

      {selectedPosts !== null && selectedPosts.length > 0 && (
        <CardStack
          posts={selectedPosts}
          onClose={() => {
            setSelectedPosts(null);
            setOpenWithCommentsPostId(null);
          }}
          initialIndex={selectedInitialIndex}
          initialFlippedPostId={openWithCommentsPostId ?? undefined}
          onInitialFlippedConsumed={() => setOpenWithCommentsPostId(null)}
          onPostDeleted={(postId) => {
            removePost(postId);
            setSelectedPosts((prev) => (prev ? prev.filter((p) => p.id !== postId) : null));
          }}
          onProfilePress={(userId) => {
            (
              navigation.getParent()?.getParent?.() as RootStackNavigationProp | undefined
            )?.navigate('FriendProfile', { userId });
          }}
        />
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
  clusterBadge: {
    backgroundColor: theme.colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  clusterBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  searchBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: theme.screenPadding,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 0,
    borderRadius: theme.borderRadius.full,
    height: theme.inputHeight,
    paddingHorizontal: theme.screenPadding,
    gap: theme.spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  searchIcon: {
    marginRight: theme.spacing.xs,
  },
  searchInput: {
    flex: 1,
    padding: 0,
  },
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  dropdown: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxHeight: 250,
    marginTop: theme.spacing.xs,
    shadowColor: theme.colors.background,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownScroll: {
    maxHeight: 250,
  },
  dropdownLoading: {
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  dropdownEmpty: {
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  dropdownItemText: {
    flex: 1,
  },
  dropdownItemName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  dropdownItemDesc: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.textSecondary,
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
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  emptySubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  recenterButton: {
    position: 'absolute',
    left: theme.screenPadding,
    width: theme.inputHeight,
    height: theme.inputHeight,
    borderRadius: theme.inputHeight / 2,
    backgroundColor: theme.colors.background,
    borderWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  fabRoot: {
    zIndex: 100,
  },
  fabOverlayPressable: {
    zIndex: 1,
  },
  fabContainer: {
    position: 'absolute',
    right: 20,
    width: 56,
    alignItems: 'flex-end',
    zIndex: 10,
    elevation: 20,
  },
  fabOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  fabSubButtonWrap: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabSubButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    margin: 0,
    padding: 0,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
