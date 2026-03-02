/**
 * SmoothImage.tsx
 *
 * Image component with fade-in animation and cached-image optimization.
 *
 * Key responsibilities:
 * - Fades in images over fadeDuration (default 200ms)
 * - Shows cached images instantly (no fade) when load completes in < 100ms
 * - Wraps Animated.Image with placeholder background
 */

import React, { useRef } from 'react';
import { Animated, View, StyleSheet, ImageProps } from 'react-native';
import { theme } from '../lib/theme';

/** Loads under 100ms are treated as cached - show immediately without fade */
const CACHED_LOAD_THRESHOLD_MS = 100;

interface SmoothImageProps extends Omit<ImageProps, 'onLoad' | 'onError'> {
  style?: ImageProps['style'];
  placeholderColor?: string;
  /** Fade duration in ms. Default 200. Use 200 for small images like avatars. */
  fadeDuration?: number;
  onLoad?: ImageProps['onLoad'];
  onError?: ImageProps['onError'];
}

export const SmoothImage: React.FC<SmoothImageProps> = ({
  style,
  placeholderColor = theme.colors.surface,
  fadeDuration = 200,
  onLoad,
  onError,
  ...props
}) => {
  /** Animated opacity: 0 on mount, 1 after load */
  const opacity = useRef(new Animated.Value(0)).current;
  /** Used to detect cached loads (instant) vs network fetches */
  const mountTime = useRef(Date.now()).current;

  const handleLoad = (e: Parameters<NonNullable<ImageProps['onLoad']>>[0]) => {
    const loadTime = Date.now() - mountTime;
    const likelyCached = loadTime < CACHED_LOAD_THRESHOLD_MS;
    // Cached images load almost instantly - skip fade for snappier UX
    if (likelyCached) {
      opacity.setValue(1);
    } else {
      Animated.timing(opacity, {
        toValue: 1,
        duration: fadeDuration,
        useNativeDriver: true,
      }).start();
    }
    onLoad?.(e);
  };

  const handleError = (e: Parameters<NonNullable<ImageProps['onError']>>[0]) => {
    onError?.(e);
  };

  return (
    <View style={[style, styles.container, { backgroundColor: placeholderColor }]}>
      <Animated.Image
        {...props}
        style={[StyleSheet.absoluteFill, { opacity }]}
        onLoad={handleLoad}
        onError={handleError}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
