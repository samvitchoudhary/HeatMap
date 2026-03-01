/**
 * UploadScreen.tsx
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
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import { StyledTextInput } from '../components/StyledTextInput';
import { SuccessToast } from '../components/SuccessToast';
import { Avatar } from '../components/Avatar';
import type { MapStackParamList } from '../navigation/types';
import { parseExifGps } from '../lib/exif';

const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  allowsEditing: true,
  quality: 0.7,
};

/** Parse EXIF date (YYYY:MM:DD HH:MM:SS) to ISO string. */
function parseExifDate(exifDate: unknown): string | null {
  if (typeof exifDate !== 'string') return null;
  try {
    const cleaned = exifDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const date = new Date(cleaned);
    return isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

export function UploadScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MapStackParamList, 'Upload'>>();
  const route = useRoute<RouteProp<MapStackParamList, 'Upload'>>();
  const { session } = useAuth();
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
  const [locationSource, setLocationSource] = useState<'exif' | 'current' | null>(null);
  const [originalPhotoDate, setOriginalPhotoDate] = useState<string | null>(null);
  const [taggedFriends, setTaggedFriends] = useState<{ id: string; display_name: string; username: string }[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [pickerFriends, setPickerFriends] = useState<{ id: string; display_name: string; username: string; avatar_url: string | null }[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);

  const appliedParamsRef = React.useRef<string | null>(null);

  const fetchFriendsForPicker = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    setPickerLoading(true);
    try {
      const { data, error } = await supabase
        .from('friendships')
        .select(
          'requester_id, addressee_id, requester:requester_id(id, username, display_name, avatar_url), addressee:addressee_id(id, username, display_name, avatar_url)'
        )
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .limit(500);

      if (error) throw error;
      const friends = (data ?? []).map((f: { requester_id: string; addressee_id: string; requester: { id: string; username: string; display_name: string; avatar_url: string | null }; addressee: { id: string; username: string; display_name: string; avatar_url: string | null } }) =>
        f.requester_id === userId ? f.addressee : f.requester
      );
      setPickerFriends(friends);
    } catch (err) {
      __DEV__ && console.error('Error fetching friends:', err);
    } finally {
      setPickerLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (showTagPicker) {
      setPickerSearch('');
      fetchFriendsForPicker();
    }
  }, [showTagPicker, fetchFriendsForPicker]);

  useFocusEffect(
    React.useCallback(() => {
      const imageUri = route.params?.imageUri;
      const exifLocation = route.params?.exifLocation ?? null;
      if (!imageUri) return;
      if (appliedParamsRef.current === imageUri) return;
      appliedParamsRef.current = imageUri;
      setSelectedImageUri(imageUri);
      setVenueName('');
      setCaption('');
      setTaggedFriends([]);
      setLocationCoords(exifLocation);
      setLocationSource(exifLocation ? 'exif' : null);
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
    }, [route.params?.imageUri, route.params?.exifLocation])
  );

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
      setLocationSource('current');
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
          setLocationSource('exif');
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
    setTaggedFriends([]);
    setLocationCoords(null);
    setLocationSource(null);
    setOriginalPhotoDate(null);
    setPostSuccess(false);
    setShowTagPicker(false);
    navigation.goBack();
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
      const timestamp = Date.now();
      const filePath = `${userId}/${timestamp}.jpg`;

      const response = await fetch(selectedImageUri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(filePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(filePath);
      const imageUrl = urlData.publicUrl;

      const postData = {
        user_id: userId,
        image_url: imageUrl,
        caption: caption.trim() || null,
        venue_name: venueName.trim() || null,
        latitude: locationCoords.latitude,
        longitude: locationCoords.longitude,
        ...(originalPhotoDate ? { created_at: originalPhotoDate } : {}),
      };
      const { data: insertedPost, error: insertError } = await supabase
        .from('posts')
        .insert(postData)
        .select('id')
        .single();

      if (insertError) throw insertError;

      const newPostId = insertedPost?.id;
      if (newPostId && taggedFriends.length > 0) {
        const tagInserts = taggedFriends.map((friend) => ({
          post_id: newPostId,
          tagged_user_id: friend.id,
        }));
        const { error: tagError } = await supabase.from('post_tags').insert(tagInserts);
        if (tagError) {
          __DEV__ && console.error('Error inserting post_tags:', tagError);
        }

        for (const friend of taggedFriends) {
          const { error } = await supabase
            .from('notifications')
            .insert({
              user_id: friend.id,
              type: 'tag',
              from_user_id: userId,
              post_id: newPostId,
            })
            .select();
          if (error) {
            __DEV__ && console.error('Tag notification failed for', friend.id, error);
          }
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPostSuccess(true);
      setShowSuccessToast(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to post. Please try again.';
      showToast(message);
    } finally {
      setIsPosting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
          >
            <Feather name="camera" size={48} color={theme.colors.primary} />
            <Text style={[styles.photoOptionLabel, styles.photoOptionLabelDark]}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.photoOptionBottom}
            onPress={handleChooseFromLibrary}
            activeOpacity={0.7}
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
          <Animated.View style={[styles.previewWrap, { opacity: previewOpacity }]}>
            <Image source={{ uri: selectedImageUri }} style={styles.preview} resizeMode="cover" />
          </Animated.View>

          <StyledTextInput
            auth
            style={styles.input}
            placeholder={isDetectingLocation ? 'Detecting location...' : 'Venue'}
            value={venueName}
            onChangeText={setVenueName}
            editable={!isDetectingLocation}
          />
          {locationSource && (
            <Text style={styles.locationSourceNote}>
              {locationSource === 'exif'
                ? "📍 Using photo's original location"
                : '📍 Using current location'}
            </Text>
          )}

          <StyledTextInput
            auth
            style={styles.input}
            placeholder="Add a caption..."
            value={caption}
            onChangeText={setCaption}
          />

          <TouchableOpacity
            style={styles.tagFriendsRow}
            onPress={() => setShowTagPicker(true)}
            activeOpacity={0.7}
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
                  >
                    <Feather name="x" size={14} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, (isPosting || postSuccess) && styles.buttonDisabled]}
            onPress={handlePost}
            disabled={isPosting}
            activeOpacity={0.8}
          >
            {isPosting ? (
              <ActivityIndicator color={theme.colors.textOnPrimary} />
            ) : postSuccess ? (
              <Feather name="check" size={24} color={theme.colors.textOnPrimary} />
            ) : (
              <Text style={styles.postButtonText}>Post</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleCancel}
            disabled={isPosting}
            activeOpacity={0.8}
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
          >
            <Text style={styles.pickerDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>

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
  locationSourceNote: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
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
