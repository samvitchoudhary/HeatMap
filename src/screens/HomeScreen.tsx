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
import type { MapStackParamList } from '../navigation/types';
import { parseExifGps } from '../lib/exif';
import { LIGHT_MAP_STYLE, HEATMAP_GRADIENT } from '../lib/mapConfig';
import MapView, { Heatmap, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
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

const NEARBY_RADIUS_METERS = 100;
const GOOGLE_MAPS_API_KEY =
  Constants.expoConfig?.ios?.config?.googleMapsApiKey ||
  Constants.expoConfig?.android?.config?.googleMapsApiKey ||
  '';

type PlacePrediction = {
  placeId: string;
  name: string;
  description: string;
};

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
  latitude: number;
  longitude: number;
  count: number;
  posts: PostWithProfile[];
};

function clusterPosts(posts: PostWithProfile[], radiusMeters: number = 100): Cluster[] {
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

export function HomeScreen({ profile, route }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MapStackParamList, 'Map'>>();
  const { cardStackOpen, setCardStackOpen } = useCardStack();
  const [posts, setPosts] = useState<PostWithProfile[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [selectedPosts, setSelectedPosts] = useState<PostWithProfile[] | null>(null);
  const [selectedInitialIndex, setSelectedInitialIndex] = useState(0);
  const [openWithCommentsPostId, setOpenWithCommentsPostId] = useState<string | null>(null);
  const [currentRegion, setCurrentRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  const dynamicRadius = currentRegion
    ? Math.max(50, Math.min(500, currentRegion.latitudeDelta * 111000 * 0.05))
    : NEARBY_RADIUS_METERS;
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

  const fetchPosts = useCallback(
    async (showLoading: boolean) => {
      const currentUserId = profile?.id;
      if (!currentUserId) {
        setPostsLoading(false);
        return;
      }
      if (showLoading) setPostsLoading(true);
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
    },
    [profile?.id]
  );

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

  async function handleFabCamera() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Close the menu visually but don't wait for it
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
  }

  async function handleFabGallery() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Close the menu visually but don't wait for it
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
  }

  const heatmapPoints = posts.map((post) => ({
    latitude: post.latitude,
    longitude: post.longitude,
    weight: 1,
  }));

  const clusters = useMemo(() => clusterPosts(posts, 100), [posts]);
  const showBadges = !currentRegion || (currentRegion.latitudeDelta ?? 1) <= 0.5;

  function handleClusterPress(cluster: Cluster) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const sorted = [...cluster.posts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    setSelectedInitialIndex(0);
    setSelectedPosts(sorted);
  }

  if (__DEV__) {
    console.log('Heatmap points:', heatmapPoints.length);
  }

  async function searchPlaces(query: string): Promise<PlacePrediction[]> {
    if (!query.trim() || !GOOGLE_MAPS_API_KEY) return [];
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error('Places API error:', data.status);
        return [];
      }
      return (data.predictions || []).map((prediction: any) => ({
        placeId: prediction.place_id,
        name: prediction.structured_formatting?.main_text || prediction.description,
        description: prediction.structured_formatting?.secondary_text || prediction.description,
      }));
    } catch (error) {
      console.error('Places API fetch error:', error);
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
        console.error('Place Details API error:', data.status);
        return null;
      }
      return {
        latitude: data.result.geometry.location.lat,
        longitude: data.result.geometry.location.lng,
      };
    } catch (error) {
      console.error('Place Details API fetch error:', error);
      return null;
    }
  }

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

  async function handleSelectPlace(place: PlacePrediction) {
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
  }

  function handleMapPress(event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) {
    Keyboard.dismiss();
    if (showDropdown) {
      setShowDropdown(false);
      return;
    }
    const { latitude, longitude } = event.nativeEvent.coordinate;
    const nearby = posts.filter((post) => {
      const distance = getDistanceMeters(
        latitude,
        longitude,
        post.latitude,
        post.longitude
      );
      return distance <= dynamicRadius;
    });
    if (nearby.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const sorted = [...nearby].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setSelectedInitialIndex(0);
      setSelectedPosts(sorted);
    }
  }

  useFocusEffect(
    useCallback(() => {
      const isInitial = !hasInitiallyFetched.current;
      hasInitiallyFetched.current = true;
      fetchPosts(isInitial);
    }, [fetchPosts])
  );

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

  async function handleRecenter() {
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
      console.error('Error getting location:', err);
    }
  }

  useFocusEffect(
    useCallback(() => {
      const params = route?.params;
      const lat = params?.latitude;
      const lng = params?.longitude;
      const postId = params?.postId;
      const showComments = params?.showComments;

      if (postId && typeof lat === 'number' && typeof lng === 'number') {
        (async () => {
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
        console.error('Error getting location:', err);
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
        onRegionChangeComplete={(region) =>
          setCurrentRegion({
            latitude: region.latitude,
            longitude: region.longitude,
            latitudeDelta: region.latitudeDelta,
            longitudeDelta: region.longitudeDelta,
          })
        }
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
            radius={40}
            opacity={0.8}
            gradient={HEATMAP_GRADIENT}
          />
        )}
        {showBadges &&
          clusters.map((cluster, i) => (
            <Marker
              key={`cluster-${i}`}
              coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
              onPress={() => handleClusterPress(cluster)}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View
                style={[
                  styles.clusterBadge,
                  cluster.count > 9 ? styles.clusterBadgeLarge : undefined,
                ]}
              >
                <Text style={styles.clusterBadgeText}>{cluster.count}</Text>
              </View>
            </Marker>
          ))}
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
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                runCloseAnimation();
              }}
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
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (fabExpanded) {
                runCloseAnimation();
              } else {
                setFabExpanded(true);
              }
            }}
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
            setPosts((prev) => prev.filter((p) => p.id !== postId));
            setSelectedPosts((prev) => (prev ? prev.filter((p) => p.id !== postId) : null));
          }}
          onProfilePress={(userId) => {
            (navigation.getParent() as any)?.getParent?.()?.navigate('FriendProfile', { userId });
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
  clusterBadgeLarge: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
