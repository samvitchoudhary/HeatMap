/**
 * useImagePicker.ts
 *
 * Extracts image selection logic: camera, gallery, compression, EXIF location.
 */

import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { parseExifGps } from '../lib/exif';

const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  allowsEditing: true,
  quality: 0.7,
};

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

export function useImagePicker() {
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [imageLocation, setImageLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [originalPhotoDate, setOriginalPhotoDate] = useState<string | null>(null);

  const pickFromCamera = useCallback(async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return null;

    const result = await ImagePicker.launchCameraAsync(IMAGE_OPTIONS);
    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    const exif = asset.exif as Record<string, unknown> | undefined;
    const exifLocation = parseExifGps(exif) ?? null;

    setSelectedImageUri(asset.uri);
    setImageLocation(exifLocation);
    setOriginalPhotoDate(null);

    return { uri: asset.uri, exifLocation };
  }, []);

  const pickFromGallery = useCallback(async () => {
    const hasPermission = await requestMediaLibraryPermission();
    if (!hasPermission) return null;

    const result = await ImagePicker.launchImageLibraryAsync({
      ...IMAGE_OPTIONS,
      mediaTypes: ['images'],
      exif: true,
    });
    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    const exif = asset.exif as Record<string, unknown> | undefined;
    const exifLocation = parseExifGps(exif) ?? null;
    const exifDate = (exif?.DateTimeOriginal || exif?.DateTime) as string | undefined;

    setSelectedImageUri(asset.uri);
    setImageLocation(exifLocation);
    setOriginalPhotoDate(exifDate ? parseExifDate(exifDate) : null);

    return { uri: asset.uri, exifLocation };
  }, []);

  const clearImage = useCallback(() => {
    setSelectedImageUri(null);
    setImageLocation(null);
    setOriginalPhotoDate(null);
  }, []);

  const setImageFromParams = useCallback(
    (uri: string, exifLocation: { latitude: number; longitude: number } | null) => {
      setSelectedImageUri(uri);
      setImageLocation(exifLocation);
      setOriginalPhotoDate(null);
    },
    []
  );

  return {
    selectedImageUri,
    imageLocation,
    originalPhotoDate,
    setSelectedImageUri,
    setImageLocation,
    setOriginalPhotoDate,
    pickFromCamera,
    pickFromGallery,
    clearImage,
    setImageFromParams,
  };
}
