import React, { useState, useCallback, useEffect } from 'react';
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
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ProfileStackParamList } from '../navigation/types';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/AuthContext';
import { useCardStack } from '../lib/CardStackContext';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import type { PostWithProfile } from '../types';
import { CardStack } from '../components/CardStack';
import { Skeleton } from '../components/Skeleton';
import { Avatar } from '../components/Avatar';

const USERNAME_REGEX = /^[a-z0-9_]+$/;
const GRID_GAP = 4;
const GRID_PADDING = 24;

function validateUsername(value: string): boolean {
  const normalized = value.toLowerCase().trim();
  return normalized.length > 0 && USERNAME_REGEX.test(normalized) && !/\s/.test(value);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_CELL_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * 2) / 3;

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList, 'Profile'>>();
  const { profile, session, refreshProfile } = useAuth();
  const { setCardStackOpen } = useCardStack();
  const userId = profile?.id ?? session?.user?.id;

  const [posts, setPosts] = useState<PostWithProfile[]>([]);
  const [postsCount, setPostsCount] = useState(0);
  const [friendsCount, setFriendsCount] = useState(0);
  const [profileDataReady, setProfileDataReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<PostWithProfile[] | null>(null);
  const [selectedInitialIndex, setSelectedInitialIndex] = useState(0);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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
    await refreshProfile();
    setRefreshing(false);
  }

  useEffect(() => {
    setCardStackOpen(selectedPosts !== null);
    return () => setCardStackOpen(false);
  }, [selectedPosts, setCardStackOpen]);

  async function pickAndUploadAvatar(getImage: () => Promise<ImagePicker.ImagePickerResult>) {
    const result = await getImage();
    if (result.canceled || !result.assets[0]) return;
    setUploadingAvatar(true);
    try {
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const filePath = `avatars/${userId}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(filePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl + '?t=' + Date.now();
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
      if (updateError) throw updateError;
      await refreshProfile();
    } catch (err) {
      console.error('Error uploading avatar:', err);
      Alert.alert('Error', 'Could not update profile photo. Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleChangeAvatar() {
    if (!userId || uploadingAvatar) return;
    Alert.alert(
      'Profile Photo',
      'Choose how to add a photo',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert(
                'Camera Permission Required',
                'HeatMap needs camera access to take a profile photo.',
              );
              return;
            }
            await pickAndUploadAvatar(() =>
              ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.7,
              })
            );
          },
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert(
                'Photo Library Permission Required',
                'HeatMap needs access to your photo library to change your profile photo.',
              );
              return;
            }
            await pickAndUploadAvatar(() =>
              ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.7,
              })
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
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

  function handleFriendsPress() {
    navigation.getParent()?.navigate('Friends' as never);
  }

  function handleViewAllPosts() {
    navigation.navigate('Gallery');
  }

  function handlePhotoPress(post: PostWithProfile) {
    const idx = posts.findIndex((p) => p.id === post.id);
    setSelectedInitialIndex(idx >= 0 ? idx : 0);
    setSelectedPosts(posts);
  }

  const displayName = profile?.display_name ?? 'User';
  const username = profile?.username ?? 'username';
  const avatarUrl = profile?.avatar_url;
  const bottomPadding = insets.bottom + 60;
  const showProfileSkeletons = !profileDataReady && !!userId;
  const gridPosts = posts.slice(0, 9);
  const hasMorePosts = posts.length > 9;

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
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={handleChangeAvatar}
            disabled={showProfileSkeletons || uploadingAvatar}
            activeOpacity={0.8}
          >
            <View style={styles.avatarContainer}>
              {showProfileSkeletons ? (
                <Skeleton width={80} height={80} borderRadius={40} />
              ) : (
                <>
                  <Avatar uri={avatarUrl ?? null} size={80} />
                  {uploadingAvatar && (
                    <View style={styles.avatarLoadingOverlay}>
                      <ActivityIndicator size="small" color={theme.colors.text} />
                    </View>
                  )}
                </>
              )}
            </View>
            {!showProfileSkeletons && (
              <View style={styles.avatarBadge}>
                <Feather name="camera" size={12} color={theme.colors.text} />
              </View>
            )}
          </TouchableOpacity>

          {showProfileSkeletons ? (
            <>
              <Skeleton width={160} height={22} borderRadius={8} style={{ marginBottom: 4 }} />
              <Skeleton width={100} height={15} borderRadius={6} style={{ marginBottom: theme.spacing.md }} />
              <View style={styles.statsRow}>
                <Skeleton width={24} height={16} borderRadius={4} />
                <Text style={styles.statsLabel}> posts  </Text>
                <Text style={styles.statsDivider}> |  </Text>
                <TouchableOpacity style={styles.statTouchable} onPress={handleFriendsPress}>
                  <Skeleton width={24} height={16} borderRadius={4} />
                  <Text style={styles.statsLabel}> friends</Text>
                </TouchableOpacity>
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
                <TouchableOpacity style={styles.statTouchable} onPress={handleFriendsPress}>
                  <Text style={styles.statsNumber}>{friendsCount}</Text>
                  <Text style={styles.statsLabel}> friends</Text>
                </TouchableOpacity>
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

        <View style={styles.gallerySection}>
          <Text style={styles.galleryHeader}>Recent Posts</Text>
          {profileDataReady && posts.length === 0 ? (
            <View style={styles.emptyGallery}>
              <Feather name="camera" size={40} color={theme.colors.textTertiary} />
              <Text style={styles.emptyGalleryText}>No posts yet</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {gridPosts.map((post) => (
                <TouchableOpacity
                  key={post.id}
                  style={styles.gridCell}
                  onPress={() => handlePhotoPress(post)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: post.image_url }}
                    style={styles.gridImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {hasMorePosts && (
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={handleViewAllPosts}
              activeOpacity={0.7}
            >
              <Feather name="grid" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.viewAllText}>View All Posts</Text>
            </TouchableOpacity>
          )}
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
        <CardStack
          posts={selectedPosts}
          onClose={() => setSelectedPosts(null)}
          initialIndex={selectedInitialIndex}
        />
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

              <Text style={styles.avatarNote}>Profile photo: tap your avatar to change it</Text>

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
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: theme.spacing.lg },
  header: {
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
  avatarWrapper: { position: 'relative', marginBottom: theme.spacing.sm },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceLight,
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
  statTouchable: { flexDirection: 'row', alignItems: 'baseline' },
  statsNumber: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },
  statsLabel: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  statsDivider: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginHorizontal: 4 },
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
  gallerySection: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  galleryHeader: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: 'left',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridCell: {
    width: GRID_CELL_SIZE,
    height: GRID_CELL_SIZE,
    borderRadius: 4,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  emptyGallery: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  emptyGalleryText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  viewAllText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
  },
  logoutText: { fontSize: theme.fontSize.sm, color: theme.colors.textTertiary },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalCenter: { width: '100%', maxWidth: 340, alignItems: 'stretch' },
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
  modalTitle: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.text },
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
  inputError: { borderColor: theme.colors.red },
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
  cancelButton: { alignItems: 'center', paddingVertical: theme.spacing.sm },
  cancelButtonText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
});
