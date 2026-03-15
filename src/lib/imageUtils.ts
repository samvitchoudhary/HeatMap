/**
 * imageUtils.ts
 *
 * Shared image utilities: compression, picker options.
 */

import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { CONFIG } from './config';

export const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  allowsEditing: true,
  quality: CONFIG.IMAGE_COMPRESS_QUALITY,
};

export async function compressImage(uri: string): Promise<string> {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: CONFIG.IMAGE_COMPRESS_WIDTH } }],
    { compress: CONFIG.IMAGE_COMPRESS_QUALITY, format: SaveFormat.JPEG }
  );
  return result.uri;
}
