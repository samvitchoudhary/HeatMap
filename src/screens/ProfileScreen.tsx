import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
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
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/AuthContext';
import { useCardStack } from '../lib/CardStackContext';
import { useToast } from '../lib/ToastContext';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import type { PostWithProfile } from '../types';
import { CardStack } from '../components/CardStack';
import { Skeleton } from '../components/Skeleton';
import { Avatar } from '../components/Avatar';
import { StyledTextInput } from '../components/StyledTextInput';

const USERNAME_REGEX = /^[a-z0-9_]+$/;
const GRID_GAP = 2;

function validateUsername(value: string): boolean {
  const normalized = value.toLowerCase().trim();
  return normalized.length > 0 && USERNAME_REGEX.test(normalized) && !/\s/.test(value);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_CELL_SIZE = (SCREEN_WIDTH - theme.screenPadding * 2 - GRID_GAP * 2) / 3;

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList, 'Profile'>>();
  const { profile, session, refreshProfile } = useAuth();
  const { setCardStackOpen } = useCardStack();
  const { showToast } = useToast();
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
  const [gridImageErrors, setGridImageErrors] = useState<Record<string, boolean>>({});
  const hasInitiallyFetched = useRef(false);

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
      const isInitial = !hasInitiallyFetched.current;
      hasInitiallyFetched.current = true;
      let mounted = true;
      if (isInitial) setProfileDataReady(false);
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
      showToast('Could not update profile photo. Please try again.');
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
      showToast(message);
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

  function handleLongPressDelete(post: PostWithProfile) {
    Alert.alert('Delete Post', "Are you sure? This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const imagePath = post.image_url.split('/posts/')[1]?.split('?')[0];
            if (imagePath) {
              await supabase.storage.from('posts').remove([imagePath]);
            }
            await supabase.from('posts').delete().eq('id', post.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
            setPostsCount((prev) => Math.max(0, prev - 1));
            setSelectedPosts((prev) => (prev ? prev.filter((p) => p.id !== post.id) : null));
          } catch (err) {
            console.error('Error deleting post:', err);
          }
        },
      },
    ]);
  }

  const displayName = profile?.display_name ?? 'User';
  const username = profile?.username ?? 'username';
  const avatarUrl = profile?.avatar_url;
  const bottomPadding = insets.bottom + 100;
  const showProfileSkeletons = !profileDataReady && !!userId;
  const gridPosts = posts.slice(0, 9);
  const hasMorePosts = posts.length > 9;
  const GRID_SLOTS = 9;
  const gridSlots = Array.from({ length: GRID_SLOTS }, (_, i) => gridPosts[i] ?? null);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 20, paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.text}
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
                  <Avatar uri={avatarUrl ?? null} size={80} profilePlaceholder />
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
                <Feather name="edit-2" size={12} color={theme.colors.textOnPrimary} />
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
                <TouchableOpacity style={styles.statTouchable} onPress={handleFriendsPress} activeOpacity={0.7}>
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
                <TouchableOpacity style={styles.statTouchable} onPress={handleFriendsPress} activeOpacity={0.7}>
                  <Text style={[styles.statsNumber, styles.statsNumberTappable]}>{friendsCount}</Text>
                  <Text style={[styles.statsLabel, styles.statsLabelTappable]}> friends</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={openEditModal}
            activeOpacity={0.8}
          >
            <Feather name="edit-2" size={14} color={theme.colors.text} />
            <Text style={styles.secondaryButtonText}>Edit Profile</Text>
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
              {gridSlots.map((post, i) =>
                post ? (
                  <TouchableOpacity
                    key={post.id}
                    style={styles.gridCell}
                    onPress={() => handlePhotoPress(post)}
                    onLongPress={() => handleLongPressDelete(post)}
                    activeOpacity={0.7}
                  >
                    {gridImageErrors[post.id] ? (
                      <View style={[styles.gridCellEmpty, styles.gridImagePlaceholder]}>
                        <Feather name="image" size={24} color={theme.colors.textTertiary} />
                      </View>
                    ) : (
                      <Image
                        source={{ uri: post.image_url }}
                        style={styles.gridImage}
                        resizeMode="cover"
                        onError={() => setGridImageErrors((prev) => ({ ...prev, [post.id]: true }))}
                      />
                    )}
                  </TouchableOpacity>
                ) : (
                  <View key={`empty-${i}`} style={[styles.gridCell, styles.gridCellEmpty]} />
                )
              )}
            </View>
          )}
          {hasMorePosts && (
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={handleViewAllPosts}
              activeOpacity={0.6}
            >
              <Feather name="grid" size={16} color={theme.colors.primary} />
              <Text style={styles.viewAllText}>View All Posts</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.destructiveButton}
          onPress={handleLogOut}
          activeOpacity={0.6}
        >
          <Feather name="log-out" size={16} color={theme.colors.red} />
          <Text style={styles.destructiveButtonText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {selectedPosts !== null && selectedPosts.length > 0 && (
        <CardStack
          posts={selectedPosts}
          onClose={() => setSelectedPosts(null)}
          initialIndex={selectedInitialIndex}
          onPostDeleted={(postId) => {
            setPosts((prev) => prev.filter((p) => p.id !== postId));
            setPostsCount((prev) => Math.max(0, prev - 1));
            setSelectedPosts((prev) => (prev ? prev.filter((p) => p.id !== postId) : null));
          }}
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
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Display Name</Text>
              <StyledTextInput
                auth
                style={styles.input}
                value={editDisplayName}
                onChangeText={setEditDisplayName}
                placeholder="Display name"
                autoCapitalize="words"
              />

              <Text style={styles.inputLabel}>Username</Text>
              <StyledTextInput
                auth
                style={[styles.input, usernameError && styles.inputError]}
                value={editUsername}
                onChangeText={(t) => {
                  setEditUsername(t);
                  setUsernameError(null);
                }}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {usernameError ? (
                <Text style={styles.errorText}>{usernameError}</Text>
              ) : null}

              <Text style={styles.avatarNote}>Profile photo: tap your avatar to change it</Text>

            <TouchableOpacity
              style={[styles.primaryButtonModal, saving && styles.buttonDisabled]}
                onPress={handleSaveProfile}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={theme.colors.textOnPrimary} />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButtonModal}
                onPress={() => setEditModalVisible(false)}
                activeOpacity={0.8}
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
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.screenPadding,
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
    backgroundColor: theme.colors.overlayMedium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
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
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: theme.spacing.lg,
  },
  statTouchable: { flexDirection: 'row', alignItems: 'baseline' },
  statsNumber: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },
  statsNumberTappable: { color: theme.colors.primary },
  statsLabel: { fontSize: theme.fontSize.xs, fontWeight: '400', color: theme.colors.textSecondary },
  statsLabelTappable: { color: theme.colors.primary },
  statsDivider: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginHorizontal: 4 },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: theme.button.secondaryHeight,
    paddingHorizontal: theme.spacing.md,
    borderRadius: 14,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  gallerySection: {
    paddingHorizontal: theme.screenPadding,
    marginBottom: theme.spacing.lg,
  },
  galleryHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: 'left',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    backgroundColor: theme.colors.background,
  },
  gridCell: {
    width: GRID_CELL_SIZE,
    height: GRID_CELL_SIZE,
    overflow: 'hidden',
    borderRadius: 4,
  },
  gridCellEmpty: {
    backgroundColor: theme.colors.surfaceLight,
  },
  gridImagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  emptyGallery: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  emptyGalleryText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
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
    fontWeight: '400',
    color: theme.colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalCenter: { width: '100%', maxWidth: 340, alignItems: 'stretch' },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  inputLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  input: {
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
  primaryButtonModal: {
    backgroundColor: theme.colors.primary,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
    ...theme.shadows.button,
  },
  buttonDisabled: { opacity: 0.8 },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textOnPrimary,
  },
  secondaryButtonModal: {
    alignItems: 'center',
    justifyContent: 'center',
    height: theme.button.secondaryHeight,
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  destructiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
  },
  destructiveButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.red,
  },
});
