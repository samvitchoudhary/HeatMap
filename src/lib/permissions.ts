/**
 * permissions.ts
 *
 * Shared permission request helpers for camera and media library.
 */

import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Camera Permission Required',
      'HeatMap needs camera access to take photos. Please enable it in your device settings.'
    );
    return false;
  }
  return true;
}

export async function requestMediaLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Photo Library Permission Required',
      'HeatMap needs access to your photo library to choose photos. Please enable it in your device settings.'
    );
    return false;
  }
  return true;
}
