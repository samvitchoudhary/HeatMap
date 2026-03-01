/**
 * Skeleton.tsx
 *
 * Animated loading placeholder for content.
 *
 * Key responsibilities:
 * - Renders a pulsing rectangle (opacity 0.3 ↔ 0.7)
 * - Used in FeedScreen and ProfileScreen while data loads
 */

import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, ViewStyle } from 'react-native';
import { theme } from '../lib/theme';

type SkeletonProps = {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
};

/** Animated skeleton placeholder - pulsing opacity */
export function Skeleton({
  width = 120,
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  /** Runs a looping opacity animation for the shimmer effect */
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: typeof width === 'string' ? width : width,
          height: typeof height === 'string' ? height : height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: theme.colors.borderLight,
  },
});
