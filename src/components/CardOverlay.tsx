/**
 * CardOverlay.tsx
 *
 * Card stack overlay chrome: background, close button.
 * Extracted from CardStack.
 */

import React, { memo } from 'react';
import { TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';

type CardOverlayProps = {
  overlayOpacity: Animated.Value;
  onClose: () => void;
};

export const CardOverlay = memo(function CardOverlay({
  overlayOpacity,
  onClose,
}: CardOverlayProps) {
  return (
    <>
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          styles.overlayBg,
          { opacity: overlayOpacity },
        ]}
        pointerEvents="none"
      />
      <TouchableOpacity
        style={styles.closeButton}
        onPress={onClose}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        activeOpacity={0.7}
      >
        <Feather name="x" size={22} color={theme.colors.text} />
      </TouchableOpacity>
    </>
  );
});

const styles = StyleSheet.create({
  overlayBg: {
    backgroundColor: theme.colors.overlay,
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
});
