import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import MapView, { Heatmap, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/AuthContext';
import { useCardStack } from '../lib/CardStackContext';
import { DARK_MAP_STYLE, HEATMAP_GRADIENT } from '../lib/mapConfig';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import type { PostWithProfile } from '../types';
import { CardStack } from '../components/CardStack';
import { Skeleton } from '../components/Skeleton';

const NEARBY_RADIUS_METERS = 500;

const USERNAME_REGEX = /^[a-z0-9_]+$/;

function validateUsername(value: string): boolean {
  const normalized = value.toLowerCase().trim();
  return normalized.length > 0 && USERNAME_REGEX.test(normalized) && !/\s/.test(value);
}

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

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { profile, session, refreshProfile } = useAuth();
  const { setCardStackOpen } = useCardStack();
  const userId = profile?.id ?? session?.user?.id;

  const [posts, setPosts] = useState<PostWithProfile[]>([]);
  const [postsCount, setPostsCount] = useState(0);
  const [friendsCount, setFriendsCount] = useState(0);
  const [profileDataReady, setProfileDataReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<PostWithProfile[] | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mapRef = useRef<MapView>(null);
  const hasFittedMap = useRef(false);

  const fetchMyPosts = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles:user_id(username, display_name, avatar_url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching profile posts:', error);
      return;
    }
    setPosts((data ?? []) as PostWithProfile[]);
  }, [userId]);

  const fetchPostsCount = useCallback(async () => {
    if (!userId) return;
    const { count, error } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (!error) setPostsCount(count ?? 0);
  }, [userId]);

  const fetchFriendsCount = useCallback(async () => {
    if (!userId) return;
    const { count, error } = await supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (!error) setFriendsCount(count ?? 0);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      Promise.all([fetchMyPosts(), fetchPostsCount(), fetchFriendsCount()]).then(() => {
        if (mounted) setProfileDataReady(true);
      });
      return () => { mounted = false; };
    }, [fetchMyPosts, fetchPostsCount, fetchFriendsCount])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([fetchMyPosts(), fetchPostsCount(), fetchFriendsCount()]);
    setRefreshing(false);
  }

  useEffect(() => {
    setCardStackOpen(selectedPosts !== null);
    return () => setCardStackOpen(false);
  }, [selectedPosts, setCardStackOpen]);

  useEffect(() => {
    if (!mapRef.current || hasFittedMap.current) return;
    if (posts.length > 0) {
      hasFittedMap.current = true;
      const coords = posts.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
      mapRef.current.fitToCoordinates(coords, { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true });
    } else {
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((loc) => {
          if (mapRef.current && !hasFittedMap.current) {
            hasFittedMap.current = true;
            mapRef.current.animateToRegion({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }, 500);
          }
        })
        .catch(() => {});
    }
  }, [posts.length]);

  function handleMapPress(event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    const nearby = posts.filter((p) => getDistanceMeters(latitude, longitude, p.latitude, p.longitude) <= NEARBY_RADIUS_METERS);
    if (nearby.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const sorted = [...nearby].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setSelectedPosts(sorted);
    }
  }

  async function handleLogOut() {
    await supabase.auth.signOut();
  }

  function openEditModal() {
    setEditDisplayName(profile?.display_name ?? '');
    setEditUsername(profile?.username ?? '');
    setUsernameError(null);
    setEditModalVisible(true);
  }

  async function handleSaveProfile() {
    const newDisplayName = editDisplayName.trim();
    const newUsername = editUsername.toLowerCase().trim();
    setUsernameError(null);
    if (!validateUsername(editUsername)) {
      setUsernameError('Lowercase, no spaces, letters numbers and underscores only');
      return;
    }
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: newDisplayName, username: newUsername })
      .eq('id', userId);
    setSaving(false);
    if (error) {
      const message =
        error.code === '23505'
          ? 'That username is already taken.'
          : error.message ?? 'Could not update profile.';
      Alert.alert('Error', message);
      return;
    }
    setEditModalVisible(false);
    await refreshProfile();
  }

  const heatmapPoints = posts.map((p) => ({ latitude: p.latitude, longitude: p.longitude, weight: 1 }));
  const displayName = profile?.display_name ?? 'User';
  const username = profile?.username ?? 'username';
  const avatarUrl = profile?.avatar_url;
  const bottomPadding = insets.bottom + 60;

  const showProfileSkeletons = !profileDataReady && !!userId;
  const showEmptyMapState = profileDataReady && posts.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.textSecondary}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            {showProfileSkeletons ? (
              <Skeleton width={80} height={80} borderRadius={40} />
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Feather name="user" size={36} color={theme.colors.textSecondary} />
              </View>
            )}
          </View>
          {showProfileSkeletons ? (
            <>
              <Skeleton width={160} height={22} borderRadius={8} style={{ marginBottom: 4 }} />
              <Skeleton width={100} height={15} borderRadius={6} style={{ marginBottom: theme.spacing.md }} />
              <View style={styles.statsRow}>
                <Skeleton width={24} height={16} borderRadius={4} />
                <Text style={styles.statsLabel}> posts  </Text>
                <Text style={styles.statsDivider}> |  </Text>
                <Skeleton width={24} height={16} borderRadius={4} />
                <Text style={styles.statsLabel}> friends</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.displayName}>{displayName}</Text>
              <Text style={styles.username}>@{username}</Text>
              <View style={styles.statsRow}>
                <Text style={styles.statsNumber}>{postsCount}</Text>
                <Text style={styles.statsLabel}> posts  </Text>
                <Text style={styles.statsDivider}> |  </Text>
                <Text style={styles.statsNumber}>{friendsCount}</Text>
                <Text style={styles.statsLabel}> friends</Text>
              </View>
            </>
          )}
          <TouchableOpacity
            style={styles.editButton}
            onPress={openEditModal}
            activeOpacity={0.7}
          >
            <Feather name="edit-2" size={14} color={theme.colors.text} />
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.mapContainer}>
          {showEmptyMapState && (
            <View style={styles.emptyMapOverlay} pointerEvents="none">
              <Feather name="camera" size={40} color={theme.colors.textTertiary} />
              <Text style={styles.emptyMapTitle}>No posts yet</Text>
              <Text style={styles.emptyMapSubtitle}>Start uploading to see your activity map</Text>
            </View>
          )}
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
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogOut}
          activeOpacity={0.7}
        >
          <Feather name="log-out" size={16} color={theme.colors.textTertiary} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {selectedPosts !== null && selectedPosts.length > 0 && (
        <CardStack posts={selectedPosts} onClose={() => setSelectedPosts(null)} />
      )}

      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setEditModalVisible(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalCenter}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <TouchableOpacity
                  onPress={() => setEditModalVisible(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Display Name</Text>
              <TextInput
                style={styles.input}
                value={editDisplayName}
                onChangeText={setEditDisplayName}
                placeholder="Display name"
                placeholderTextColor={theme.colors.textTertiary}
                autoCapitalize="words"
              />

              <Text style={styles.inputLabel}>Username</Text>
              <TextInput
                style={[styles.input, usernameError && styles.inputError]}
                value={editUsername}
                onChangeText={(t) => {
                  setEditUsername(t);
                  setUsernameError(null);
                }}
                placeholder="username"
                placeholderTextColor={theme.colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {usernameError ? (
                <Text style={styles.errorText}>{usernameError}</Text>
              ) : null}

              <Text style={styles.avatarNote}>Avatar upload coming soon</Text>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveProfile}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setEditModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing.lg,
  },
  header: {
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  username: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: theme.spacing.md,
  },
  statsNumber: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
  },
  statsLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  statsDivider: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  editButtonText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: '500',
  },
  mapContainer: {
    height: 340,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  emptyMapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 10, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
    zIndex: 1,
  },
  emptyMapTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  emptyMapSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
  },
  logoutText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalCenter: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'stretch',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
  },
  inputLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  inputError: {
    borderColor: theme.colors.red,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.red,
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  avatarNote: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.lg,
  },
  saveButton: {
    backgroundColor: theme.colors.text,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  saveButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.background,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  cancelButtonText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
});
