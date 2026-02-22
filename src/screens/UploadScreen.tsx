import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Animated,
  KeyboardAvoidingView,
  Platform,
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
  const previewOpacity = useRef(new Animated.Value(0)).current;
  const [locationCoords, setLocationCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationSource, setLocationSource] = useState<'exif' | 'current' | null>(null);
  const [originalPhotoDate, setOriginalPhotoDate] = useState<string | null>(null);

  const appliedParamsRef = React.useRef<string | null>(null);

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
    setLocationCoords(null);
    setLocationSource(null);
    setOriginalPhotoDate(null);
    setPostSuccess(false);
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
      const { error: insertError } = await supabase.from('posts').insert(postData);

      if (insertError) throw insertError;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPostSuccess(true);
      setTimeout(() => {
        handleCancel();
      }, 1200);
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
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
});
