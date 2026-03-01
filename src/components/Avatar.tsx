/**
 * Avatar.tsx
 *
 * User avatar image with fallback placeholder.
 *
 * Key responsibilities:
 * - Displays profile/avatar image from URL
 * - Shows user icon or broken-image icon when no URL or load error
 * - Supports profilePlaceholder variant (primary-tinted background) for profile screens
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { SmoothImage } from './SmoothImage';

type AvatarProps = {
  uri: string | null;
  size: number;
  /** Profile placeholder: primaryLight 15% bg, primary user icon */
  profilePlaceholder?: boolean;
};

/**
 * Avatar
 *
 * Renders a circular avatar image or placeholder.
 *
 * @param uri - Image URL or null for placeholder
 * @param size - Diameter in pixels
 * @param profilePlaceholder - Use primary-tinted background for profile screens
 */
export function Avatar({ uri, size, profilePlaceholder }: AvatarProps) {
  const radius = size / 2;
  /** True when image fails to load - shows broken-image icon instead */
  const [loadError, setLoadError] = useState(false);

  if (!uri || loadError) {
    return (
      <View
        style={[
          styles.placeholder,
          profilePlaceholder && styles.placeholderProfile,
          { width: size, height: size, borderRadius: radius },
        ]}
      >
        <Feather
          name={loadError ? 'image' : 'user'}
          size={loadError ? 24 : size * 0.45}
          color={profilePlaceholder && !loadError ? theme.colors.primary : theme.colors.textTertiary}
        />
      </View>
    );
  }
  return (
    <View style={[styles.imageWrap, { width: size, height: size, borderRadius: radius }]}>
      <SmoothImage
        source={{ uri }}
        style={[styles.image, { width: size, height: size, borderRadius: radius }]}
        resizeMode="cover"
        fadeDuration={200}
        onError={() => setLoadError(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    overflow: 'hidden',
  },
  image: {
    overflow: 'hidden',
  },
  placeholder: {
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  placeholderProfile: {
    backgroundColor: 'rgba(255, 122, 143, 0.15)',
  },
});
