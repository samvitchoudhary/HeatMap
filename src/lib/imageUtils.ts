/**
 * imageUtils.ts
 *
 * Shared image utilities: compression, EXIF parsing.
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export async function compressImage(uri: string): Promise<string> {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: 1080 } }],
    { compress: 0.7, format: SaveFormat.JPEG }
  );
  return result.uri;
}
