import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCardStack } from '../lib/CardStackContext';
import { DARK_MAP_STYLE, HEATMAP_GRADIENT } from '../lib/mapConfig';
import MapView, { Heatmap, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import type { Profile, PostWithProfile } from '../types';
import type { MainTabParamList } from '../navigation/types';
import { CardStack } from '../components/CardStack';
import { StyledTextInput } from '../components/StyledTextInput';

type HomeScreenProps = {
  profile: Profile | null;
  route?: RouteProp<MainTabParamList, 'Map'>;
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

export function HomeScreen({ profile, route }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { setCardStackOpen } = useCardStack();
  const [posts, setPosts] = useState<PostWithProfile[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [selectedPosts, setSelectedPosts] = useState<PostWithProfile[] | null>(null);
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

  const heatmapPoints = posts.map((post) => ({
    latitude: post.latitude,
    longitude: post.longitude,
    weight: 1,
  }));

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
    if (showDropdown) {
      Keyboard.dismiss();
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
      const lat = route?.params?.latitude;
      const lng = route?.params?.longitude;
      if (typeof lat === 'number' && typeof lng === 'number' && mapRef.current) {
        mapRef.current.animateToRegion(
          {
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          },
          1000
        );
        (navigation as { setParams: (p: object) => void }).setParams({ latitude: undefined, longitude: undefined });
      }
    }, [route?.params?.latitude, route?.params?.longitude, navigation])
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
        customMapStyle={DARK_MAP_STYLE}
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
            radius={80}
            opacity={0.8}
            gradient={HEATMAP_GRADIENT}
          />
        )}
      </MapView>

      {showSearchBar && (
        <>
          <View style={[styles.searchBarContainer, { top: insets.top + 12 }]} pointerEvents="box-none">
            <View
              style={[
                styles.searchBar,
                { borderColor: searchFocused ? theme.colors.textSecondary : theme.colors.border },
              ]}
            >
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
          <Feather name="navigation" size={20} color={theme.colors.text} />
        </TouchableOpacity>
      )}

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
        <CardStack
          posts={selectedPosts}
          onClose={() => setSelectedPosts(null)}
          onPostDeleted={(postId) => {
            setPosts((prev) => prev.filter((p) => p.id !== postId));
            setSelectedPosts((prev) => (prev ? prev.filter((p) => p.id !== postId) : null));
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
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    height: theme.inputHeight,
    paddingHorizontal: theme.screenPadding,
    gap: theme.spacing.sm,
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
    backgroundColor: 'rgba(10, 10, 10, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: theme.fontSize.title,
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
  recenterButton: {
    position: 'absolute',
    left: theme.screenPadding,
    width: theme.inputHeight,
    height: theme.inputHeight,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
