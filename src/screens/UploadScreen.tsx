import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import type { MainTabParamList } from '../navigation/types';

const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  allowsEditing: true,
  quality: 0.7,
};

export function UploadScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Upload'>>();
  const { session } = useAuth();
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

  async function detectVenue() {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return;

    setIsDetectingLocation(true);
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocationCoords({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
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
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedImageUri(result.assets[0].uri);
      setVenueName('');
      setCaption('');
      setLocationCoords(null);
      previewOpacity.setValue(0);
      Animated.timing(previewOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      detectVenue();
    }
  }

  function handleCancel() {
    setSelectedImageUri(null);
    setVenueName('');
    setCaption('');
    setLocationCoords(null);
    setPostSuccess(false);
    navigation.navigate('Map');
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

      const { error: insertError } = await supabase.from('posts').insert({
        user_id: userId,
        image_url: imageUrl,
        caption: caption.trim() || null,
        venue_name: venueName.trim() || null,
        latitude: locationCoords.latitude,
        longitude: locationCoords.longitude,
      });

      if (insertError) throw insertError;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPostSuccess(true);
      setTimeout(() => {
        handleCancel();
      }, 1200);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to post. Please try again.';
      Alert.alert('Post Failed', message);
    } finally {
      setIsPosting(false);
    }
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      {!selectedImageUri ? (
        <View style={styles.photoSelection}>
          <TouchableOpacity style={styles.photoTile} onPress={handleTakePhoto}>
            <Feather name="camera" size={32} color="#FFF" />
            <Text style={styles.photoTileLabel}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoTile} onPress={handleChooseFromLibrary}>
            <Feather name="image" size={32} color="#FFF" />
            <Text style={styles.photoTileLabel}>Library</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Animated.View style={[styles.previewWrap, { opacity: previewOpacity }]}>
            <Image source={{ uri: selectedImageUri }} style={styles.preview} resizeMode="cover" />
          </Animated.View>

          <TextInput
            style={styles.input}
            placeholder={isDetectingLocation ? 'Detecting location...' : 'Venue'}
            placeholderTextColor={theme.colors.textTertiary}
            value={venueName}
            onChangeText={setVenueName}
            editable={!isDetectingLocation}
          />

          <TextInput
            style={styles.input}
            placeholder="Add a caption..."
            placeholderTextColor={theme.colors.textTertiary}
            value={caption}
            onChangeText={setCaption}
          />

          <TouchableOpacity
            style={[styles.postButton, (isPosting || postSuccess) && styles.buttonDisabled]}
            onPress={handlePost}
            disabled={isPosting}
          >
            {isPosting ? (
              <ActivityIndicator color={theme.colors.background} />
            ) : postSuccess ? (
              <Feather name="check" size={24} color={theme.colors.background} />
            ) : (
              <Text style={styles.postButtonText}>Post</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            disabled={isPosting}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: 48,
  },
  photoSelection: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.xl,
  },
  photoTile: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoTileLabel: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
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
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  postButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  postButtonText: {
    color: '#000000',
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
  cancelButton: {
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
});
