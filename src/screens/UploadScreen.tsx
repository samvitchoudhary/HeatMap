/**
 * UploadScreen.tsx
 *
 * NOTE: This file is over 1000 lines. Future refactoring candidates:
 * - Extract useLocationDetection hook (requestLocationPermission, reverseGeocode, detectVenue)
 * - Extract usePostUpload hook (compression, storage upload, post insert, tag insert, notifications)
 * - Extract TagFriendsModal component (search, friend list, selection state)
 * - Extract CategoryPicker component (horizontal chip ScrollView)
 * - Move reverseGeocode and uploadImageToStorage utilities to shared lib files
 *
 * Photo upload flow - venue, caption, friend tagging.
 *
 * Key responsibilities:
 * - Receives imageUri and optional exifLocation from Map (FAB) or route params
 * - EXIF GPS or current location for venue; reverse geocode for venue name
 * - Caption input, friend tag picker (from accepted friendships)
 * - Uploads to Supabase storage, inserts post + post_tags, sends notifications
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { useFriends, usePosts } from '../hooks';
import { supabase } from '../lib/supabase';
import { shouldSendNotification } from '../lib/notifications';
import { theme } from '../lib/theme';
import { StyledTextInput } from '../components/StyledTextInput';
import { LocationSearchModal, type PlaceResult } from '../components/LocationSearchModal';
import { SuccessToast } from '../components/SuccessToast';
import { Avatar } from '../components/Avatar';
import type { MapStackParamList } from '../navigation/types';
import type { PostWithProfile } from '../types';
import { parseExifGps, parseExifDate } from '../lib/exif';
import { withRetry } from '../lib/retry';
import { compressImage, IMAGE_OPTIONS } from '../lib/imageUtils';
import { requestCameraPermission, requestMediaLibraryPermission } from '../lib/permissions';
import { CATEGORIES, DEFAULT_CATEGORY, type CategoryKey } from '../lib/categories';

export function UploadScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MapStackParamList, 'Upload'>>();
  const route = useRoute<RouteProp<MapStackParamList, 'Upload'>>();
  const { session, profile } = useAuth();
  const { showToast } = useToast();
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [venueName, setVenueName] = useState('');
  const [caption, setCaption] = useState('');
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const previewOpacity = useRef(new Animated.Value(0)).current;
  const [locationCoords, setLocationCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationSource, setLocationSource] = useState<'auto' | 'search' | null>(null);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [originalPhotoDate, setOriginalPhotoDate] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>(DEFAULT_CATEGORY);
  const [taggedFriends, setTaggedFriends] = useState<{ id: string; display_name: string; username: string }[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const { friends: pickerFriends, loading: pickerLoading, refresh: refreshFriends } = useFriends();
  const { addPost, updatePost } = usePosts();

  const appliedParamsRef = React.useRef<string | null>(null);
  const editMode = route.params?.editMode ?? false;
  const editPost = route.params?.editPost ?? null;

  useEffect(() => {
    if (showTagPicker) {
      setPickerSearch('');
      refreshFriends();
    }
  }, [showTagPicker, refreshFriends]);

  useFocusEffect(
    React.useCallback(() => {
      if (editMode && editPost) {
        if (appliedParamsRef.current === `edit-${editPost.id}`) return;
        appliedParamsRef.current = `edit-${editPost.id}`;
        setCaption(editPost.caption ?? '');
        setVenueName(editPost.venue_name ?? '');
        setSelectedCategory((editPost.category as CategoryKey) ?? DEFAULT_CATEGORY);
        setSelectedImageUri(editPost.image_url);
        setLocationCoords({ latitude: editPost.latitude, longitude: editPost.longitude });
        setLocationSource('auto');
        if (editPost.post_tags && editPost.post_tags.length > 0) {
          const tagged = editPost.post_tags.map((tag: { tagged_user_id: string; profiles?: { display_name: string; username: string } | null }) => ({
            id: tag.tagged_user_id,
            display_name: tag.profiles?.display_name ?? '',
            username: tag.profiles?.username ?? '',
          }));
          setTaggedFriends(tagged);
        } else {
          setTaggedFriends([]);
        }
        setOriginalPhotoDate(null);
        previewOpacity.setValue(0);
        Animated.timing(previewOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        return () => {
          appliedParamsRef.current = null;
        };
      }
      const imageUri = route.params?.imageUri;
      const exifLocation = route.params?.exifLocation ?? null;
      if (!imageUri) return;
      if (appliedParamsRef.current === imageUri) return;
      appliedParamsRef.current = imageUri;
      setSelectedImageUri(imageUri);
      setVenueName('');
      setCaption('');
      setSelectedCategory(DEFAULT_CATEGORY);
      setTaggedFriends([]);
      setLocationCoords(exifLocation);
      setLocationSource(exifLocation ? 'auto' : null);
      setOriginalPhotoDate(null);
      previewOpacity.setValue(0);
      Animated.timing(previewOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      if (exifLocation) {
        reverseGeocodeAndSetVenue(exifLocation.latitude, exifLocation.longitude);
      } else {
        detectVenue();
      }
      return () => {
        appliedParamsRef.current = null;
      };
    }, [route.params?.imageUri, route.params?.exifLocation, editMode, editPost])
  );

  async function requestLocationPermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Location Permission Required',
        'HeatMap needs your location to tag your post and suggest a venue. Please enable it in your device settings.',
      );
      return false;
    }
    return true;
  }

  async function reverseGeocodeAndSetVenue(latitude: number, longitude: number) {
    try {
      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });
      if (reverseGeocode.length > 0) {
        const place = reverseGeocode[0];
        const name = place.name ?? '';
        const street = place.street ?? '';
        const city = place.city ?? '';
        const venue = name || (street && city ? `${street}, ${city}` : street || city || 'Unknown location');
        setVenueName(venue);
      } else {
        setVenueName('Unknown location');
      }
    } catch {
      setVenueName('Unknown location');
    }
  }

  async function detectVenue() {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return;

    setIsDetectingLocation(true);
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setLocationCoords(coords);
      setLocationSource('auto');
      await reverseGeocodeAndSetVenue(coords.latitude, coords.longitude);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get location.';
      Alert.alert('Location Error', message);
      setVenueName('');
    } finally {
      setIsDetectingLocation(false);
    }
  }

  async function handleTakePhoto() {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync(IMAGE_OPTIONS);
    if (!result.canceled && result.assets[0]) {
      setSelectedImageUri(result.assets[0].uri);
      setVenueName('');
      setCaption('');
      setSelectedCategory(DEFAULT_CATEGORY);
      setTaggedFriends([]);
      setLocationCoords(null);
      setLocationSource(null);
      setOriginalPhotoDate(null);
      previewOpacity.setValue(0);
      Animated.timing(previewOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      detectVenue();
    }
  }

  async function handleChooseFromLibrary() {
    const hasPermission = await requestMediaLibraryPermission();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      ...IMAGE_OPTIONS,
      mediaTypes: ['images'],
      exif: true,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedImageUri(result.assets[0].uri);
      setVenueName('');
      setCaption('');
      setSelectedCategory(DEFAULT_CATEGORY);
      setTaggedFriends([]);
      setLocationCoords(null);
      setLocationSource(null);
      previewOpacity.setValue(0);
      Animated.timing(previewOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();

      const exif = result.assets[0].exif as Record<string, unknown> | undefined;
      const exifCoords = parseExifGps(exif);
      const exifDate = (exif?.DateTimeOriginal || exif?.DateTime) as string | undefined;
      setOriginalPhotoDate(exifDate ? parseExifDate(exifDate) : null);

      setIsDetectingLocation(true);
      try {
        if (exifCoords) {
          setLocationCoords(exifCoords);
          setLocationSource('auto');
          await reverseGeocodeAndSetVenue(exifCoords.latitude, exifCoords.longitude);
        } else {
          await detectVenue();
        }
      } finally {
        setIsDetectingLocation(false);
      }
    }
  }

  function handleCancel() {
    setSelectedImageUri(null);
    setVenueName('');
    setCaption('');
    setSelectedCategory(DEFAULT_CATEGORY);
    setTaggedFriends([]);
    setLocationCoords(null);
    setLocationSource(null);
    setOriginalPhotoDate(null);
    setPostSuccess(false);
    setShowTagPicker(false);
    navigation.goBack();
  }

  useFocusEffect(
    React.useCallback(() => {
      return () => {
        if (editMode) {
          setCaption('');
          setVenueName('');
          setSelectedCategory(DEFAULT_CATEGORY);
          setSelectedImageUri(null);
          setTaggedFriends([]);
          setLocationCoords(null);
          setLocationSource(null);
        }
      };
    }, [editMode])
  );

  async function handleUpdatePost() {
    if (!editPost || !session?.user?.id) return;

    setIsPosting(true);
    try {
      const { error: updateError } = await supabase
        .from('posts')
        .update({
          caption: caption.trim() || null,
          venue_name: venueName.trim() || null,
          category: selectedCategory,
          latitude: locationCoords?.latitude ?? editPost.latitude,
          longitude: locationCoords?.longitude ?? editPost.longitude,
        })
        .eq('id', editPost.id);

      if (updateError) throw updateError;

      const { error: deleteTagsError } = await supabase
        .from('post_tags')
        .delete()
        .eq('post_id', editPost.id);

      if (deleteTagsError) __DEV__ && console.error('Failed to delete old tags:', deleteTagsError);

      if (taggedFriends.length > 0) {
        const tagInserts = taggedFriends.map((friend) => ({
          post_id: editPost.id,
          tagged_user_id: friend.id,
        }));

        const { error: tagError } = await supabase.from('post_tags').insert(tagInserts);
        if (tagError) __DEV__ && console.error('Failed to insert tags:', tagError);

        const originalTagIds = (editPost.post_tags ?? []).map((t: { tagged_user_id: string }) => t.tagged_user_id);
        const newlyTagged = taggedFriends.filter((f) => !originalTagIds.includes(f.id));

        if (newlyTagged.length > 0) {
          const toNotify = [];
          for (const friend of newlyTagged) {
            const ok = await shouldSendNotification(friend.id, 'tag');
            if (ok) {
              toNotify.push({
                user_id: friend.id,
                type: 'tag',
                from_user_id: session.user.id,
                post_id: editPost.id,
              });
            }
          }
          if (toNotify.length > 0) {
            await supabase.from('notifications').insert(toNotify);
          }
        }
      }

      updatePost(editPost.id, {
        caption: caption.trim() || null,
        venue_name: venueName.trim() || null,
        category: selectedCategory,
        latitude: locationCoords?.latitude ?? editPost.latitude,
        longitude: locationCoords?.longitude ?? editPost.longitude,
        post_tags:
          taggedFriends.length > 0
            ? taggedFriends.map((f) => ({
                tagged_user_id: f.id,
                profiles: { display_name: f.display_name, username: f.username },
              }))
            : undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Post updated!');
      navigation.goBack();
    } catch (err) {
      if (__DEV__) console.error('Failed to update post:', err);
      Alert.alert('Error', 'Failed to update post. Please try again.');
    } finally {
      setIsPosting(false);
    }
  }

  async function handlePost() {
    if (!selectedImageUri) return;

    const userId = session?.user?.id;
    if (!userId) {
      Alert.alert('Error', 'You must be logged in to post.');
      return;
    }

    if (!locationCoords) {
      Alert.alert('Error', 'Location is required. Please wait for location detection or enable location permissions.');
      return;
    }

    setIsPosting(true);
    try {
      let finalUri = selectedImageUri;
      try {
        finalUri = await compressImage(selectedImageUri);
      } catch (compressErr) {
        if (__DEV__) console.error('Compression failed, using original:', compressErr);
      }

      const fileExt = 'jpg';
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      const response = await fetch(finalUri);
      const arraybuffer = await response.arrayBuffer();

      const { error: uploadError } = await withRetry(async () => {
        const result = await supabase.storage
          .from('posts')
          .upload(filePath, arraybuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          });
        if (result.error) throw result.error;
        return result;
      });

      if (uploadError) {
        __DEV__ && console.error('Upload failed:', uploadError);
        throw uploadError;
      }
      if (__DEV__) console.log('Upload success, path:', filePath);

      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(filePath);
      const imageUrl = urlData.publicUrl;

      const postData = {
        user_id: userId,
        image_url: imageUrl,
        caption: caption.trim() || null,
        venue_name: venueName.trim() || null,
        latitude: locationCoords.latitude,
        longitude: locationCoords.longitude,
        category: selectedCategory,
        ...(originalPhotoDate ? { created_at: originalPhotoDate } : {}),
      };
      const { data: insertedPost, error: insertError } = await withRetry(async () => {
        const result = await supabase
          .from('posts')
          .insert(postData)
          .select('id')
          .single();
        if (result.error) throw result.error;
        return result;
      });

      if (insertError) throw insertError;

      const newPostId = insertedPost?.id;

      if (profile && newPostId) {
        addPost({
          id: newPostId,
          user_id: userId,
          image_url: imageUrl,
          caption: caption.trim() || null,
          venue_name: venueName.trim() || null,
          latitude: locationCoords.latitude,
          longitude: locationCoords.longitude,
          category: selectedCategory,
          created_at: originalPhotoDate ?? new Date().toISOString(),
          profiles: {
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
          },
          post_tags: taggedFriends.length > 0
            ? taggedFriends.map((f) => ({
                tagged_user_id: f.id,
                profiles: { display_name: f.display_name, username: f.username },
              }))
            : undefined,
        } as PostWithProfile);
      }

      if (newPostId && taggedFriends.length > 0) {
        const tagInserts = taggedFriends.map((friend) => ({
          post_id: newPostId,
          tagged_user_id: friend.id,
        }));
        const { error: tagError } = await supabase.from('post_tags').insert(tagInserts);
        if (tagError) {
          __DEV__ && console.error('Failed to insert tags:', tagError);
        }

        const toNotify = [];
        for (const friend of taggedFriends) {
          const ok = await shouldSendNotification(friend.id, 'tag');
          if (ok) {
            toNotify.push({
              user_id: friend.id,
              type: 'tag',
              from_user_id: userId,
              post_id: newPostId,
            });
          }
        }
        if (toNotify.length > 0) {
          const { error: notifError } = await supabase.from('notifications').insert(toNotify);
          if (notifError) {
            __DEV__ && console.error('Failed to send tag notifications:', notifError);
          }
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPostSuccess(true);
      setSelectedCategory(DEFAULT_CATEGORY);
      setShowSuccessToast(true);
    } catch (error: unknown) {
      if (__DEV__) console.error('Post failed:', error);
      Alert.alert('Error', 'Failed to post. Please try again.');
    } finally {
      setIsPosting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.dismissWrap}>
      {!selectedImageUri ? (
        <View
          style={[
            styles.photoSelection,
            {
              paddingTop: insets.top,
              paddingBottom: insets.bottom + 80,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.photoOptionTop}
            onPress={handleTakePhoto}
            activeOpacity={0.7}
            accessibilityLabel="Take photo"
            accessibilityRole="button"
          >
            <Feather name="camera" size={48} color={theme.colors.primary} />
            <Text style={[styles.photoOptionLabel, styles.photoOptionLabelDark]}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.photoOptionBottom}
            onPress={handleChooseFromLibrary}
            activeOpacity={0.7}
            accessibilityLabel="Choose from library"
            accessibilityRole="button"
          >
            <Feather name="image" size={48} color={theme.colors.secondary} />
            <Text style={[styles.photoOptionLabel, styles.photoOptionLabelDark]}>Choose from Library</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 80,
            },
          ]}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <>
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 16 }}>
            {editMode ? 'Edit Post' : 'New Post'}
          </Text>
          <Animated.View style={[styles.previewWrap, { opacity: previewOpacity }]}>
            <Image source={{ uri: selectedImageUri }} style={styles.preview} resizeMode="cover" />
            {editMode && (
              <View
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Feather name="lock" size={12} color="#FFF" />
                <Text style={{ color: '#FFF', fontSize: 10, marginLeft: 4 }}>Photo locked</Text>
              </View>
            )}
          </Animated.View>

          <TouchableOpacity
            onPress={() => !isDetectingLocation && setShowLocationSearch(true)}
            style={styles.venueField}
            activeOpacity={0.7}
            disabled={isDetectingLocation}
            accessibilityLabel="Add location"
            accessibilityRole="button"
          >
            <Feather name="map-pin" size={16} color={theme.colors.textSecondary} style={styles.venueIcon} />
            <View style={styles.venueTextWrap}>
              <Text
                style={[
                  styles.venueMainText,
                  { color: venueName ? theme.colors.text : theme.colors.textTertiary },
                ]}
              >
                {isDetectingLocation ? 'Detecting location...' : venueName || 'Add location...'}
              </Text>
              {venueName && locationSource === 'auto' && (
                <Text style={styles.venueSubText}>From photo location</Text>
              )}
              {venueName && locationSource === 'search' && (
                <Text style={styles.venueSubText}>Custom location</Text>
              )}
            </View>
            {!isDetectingLocation && (
              <Feather name="chevron-right" size={16} color={theme.colors.textTertiary} />
            )}
          </TouchableOpacity>

          <StyledTextInput
            auth
            style={styles.input}
            placeholder="Add a caption..."
            value={caption}
            onChangeText={setCaption}
          />

          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text, marginBottom: 8, marginTop: 16 }}>
            Category
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
          >
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.key;
              return (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => setSelectedCategory(cat.key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    marginRight: 8,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: isSelected ? cat.color : theme.colors.border,
                  }}
                  accessibilityLabel={`${cat.label} category`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  {isSelected && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: cat.color,
                        marginRight: 6,
                      }}
                    />
                  )}
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: isSelected ? '700' : '500',
                      color: isSelected ? cat.color : theme.colors.textSecondary,
                    }}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.tagFriendsRow}
            onPress={() => setShowTagPicker(true)}
            activeOpacity={0.7}
            accessibilityLabel="Tag friends"
            accessibilityRole="button"
          >
            <Feather name="user-plus" size={18} color={theme.colors.textSecondary} />
            <Text style={styles.tagFriendsLabel}>Tag Friends</Text>
            <Feather name="chevron-right" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
          {taggedFriends.length > 0 && (
            <View style={styles.taggedChipsWrap}>
              {taggedFriends.map((friend) => (
                <View key={friend.id} style={styles.taggedChip}>
                  <Text style={styles.taggedChipText} numberOfLines={1}>
                    {friend.display_name}
                  </Text>
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() =>
                      setTaggedFriends((prev) => prev.filter((f) => f.id !== friend.id))
                    }
                    activeOpacity={0.7}
                    accessibilityLabel={`Remove ${friend.display_name}`}
                    accessibilityRole="button"
                  >
                    <Feather name="x" size={14} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, (isPosting || postSuccess) && styles.buttonDisabled]}
            onPress={editMode ? handleUpdatePost : handlePost}
            disabled={isPosting}
            activeOpacity={0.8}
            accessibilityLabel={editMode ? 'Save changes' : 'Post'}
            accessibilityRole="button"
          >
            {isPosting ? (
              <ActivityIndicator color={theme.colors.textOnPrimary} />
            ) : postSuccess ? (
              <Feather name="check" size={24} color={theme.colors.textOnPrimary} />
            ) : (
              <Text style={styles.postButtonText}>{editMode ? 'Save Changes' : 'Post'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleCancel}
            disabled={isPosting}
            activeOpacity={0.8}
            accessibilityLabel="Cancel"
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </>
        </ScrollView>
      )}
      </View>
      </TouchableWithoutFeedback>

      <Modal
        visible={showTagPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTagPicker(false)}
      >
        <View style={[styles.pickerContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Tag Friends</Text>
            <TouchableOpacity
              onPress={() => setShowTagPicker(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <Feather name="x" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.pickerSearchWrap}>
            <Feather name="search" size={18} color={theme.colors.textTertiary} />
            <StyledTextInput
              auth
              style={styles.pickerSearchInput}
              placeholder="Search friends..."
              value={pickerSearch}
              onChangeText={setPickerSearch}
            />
          </View>
          {pickerLoading ? (
            <View style={styles.pickerLoading}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : (
            <ScrollView
              style={styles.pickerList}
              contentContainerStyle={styles.pickerListContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {pickerFriends
                .filter(
                  (f) =>
                    !pickerSearch.trim() ||
                    f.display_name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                    f.username.toLowerCase().includes(pickerSearch.toLowerCase())
                )
                .map((friend) => {
                  const isTagged = taggedFriends.some((t) => t.id === friend.id);
                  return (
                    <TouchableOpacity
                      key={friend.id}
                      style={styles.pickerRow}
                      onPress={() => {
                        if (isTagged) {
                          setTaggedFriends((prev) => prev.filter((f) => f.id !== friend.id));
                        } else {
                          setTaggedFriends((prev) => [...prev, { id: friend.id, display_name: friend.display_name, username: friend.username }]);
                        }
                      }}
                      activeOpacity={0.7}
                      accessibilityLabel={`${isTagged ? 'Remove' : 'Tag'} ${friend.display_name}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isTagged }}
                    >
                      <Avatar uri={friend.avatar_url} size={24} />
                      <View style={styles.pickerRowText}>
                        <Text style={styles.pickerRowName} numberOfLines={1}>
                          {friend.display_name}
                        </Text>
                        <Text style={styles.pickerRowUsername} numberOfLines={1}>
                          @{friend.username}
                        </Text>
                      </View>
                      {isTagged ? (
                        <Feather name="check" size={20} color={theme.colors.primary} />
                      ) : (
                        <View style={styles.pickerRowEmpty} />
                      )}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          )}
          <TouchableOpacity
            style={styles.pickerDoneBtn}
            onPress={() => setShowTagPicker(false)}
            activeOpacity={0.8}
            accessibilityLabel="Done"
            accessibilityRole="button"
          >
            <Text style={styles.pickerDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <LocationSearchModal
        visible={showLocationSearch}
        onClose={() => setShowLocationSearch(false)}
        onSelectLocation={(place: PlaceResult) => {
          setVenueName(place.name);
          setLocationCoords({ latitude: place.latitude, longitude: place.longitude });
          setLocationSource('search');
        }}
      />

      <SuccessToast
        message="Posted!"
        visible={showSuccessToast}
        onHide={() => {
          setShowSuccessToast(false);
          handleCancel();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dismissWrap: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: theme.screenPadding,
  },
  photoSelection: {
    flex: 1,
  },
  photoOptionTop: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  photoOptionBottom: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoOptionLabel: {
    marginTop: theme.spacing.sm,
    fontSize: 18,
    fontWeight: '600',
  },
  photoOptionLabelDark: {
    color: theme.colors.text,
  },
  previewWrap: {
    marginBottom: theme.spacing.lg,
  },
  preview: {
    width: '100%',
    height: 300,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
  },
  input: {
    marginBottom: theme.spacing.md,
  },
  venueField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  venueIcon: { marginRight: 8 },
  venueTextWrap: { flex: 1 },
  venueMainText: { fontSize: 14 },
  venueSubText: { fontSize: 11, color: theme.colors.textTertiary, marginTop: 2 },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
    ...theme.shadows.button,
  },
  buttonDisabled: {
    opacity: 0.8,
  },
  postButtonText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    height: theme.button.secondaryHeight,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  tagFriendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  tagFriendsLabel: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '500',
  },
  taggedChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  taggedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: theme.borderRadius.full,
    gap: 6,
    maxWidth: '100%',
  },
  taggedChipText: {
    fontSize: 14,
    color: theme.colors.text,
    maxWidth: 120,
  },
  pickerContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.screenPadding,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  pickerSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: theme.screenPadding,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
    gap: theme.spacing.sm,
  },
  pickerSearchInput: {
    flex: 1,
    padding: 0,
  },
  pickerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerList: {
    flex: 1,
  },
  pickerListContent: {
    paddingHorizontal: theme.screenPadding,
    paddingBottom: theme.spacing.lg,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  pickerRowText: {
    flex: 1,
  },
  pickerRowName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  pickerRowUsername: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  pickerRowEmpty: {
    width: 20,
  },
  pickerDoneBtn: {
    backgroundColor: theme.colors.primary,
    marginHorizontal: theme.screenPadding,
    marginBottom: theme.spacing.lg,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.button,
  },
  pickerDoneText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
