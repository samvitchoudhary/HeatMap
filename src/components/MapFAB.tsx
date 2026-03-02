/**
 * MapFAB.tsx
 *
 * Floating action button with camera/gallery options and expand/collapse animation.
 * Extracted from HomeScreen.
 */

import React, { memo, useState, useRef, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme } from '../lib/theme';

type MapFABProps = {
  onCamera: () => void;
  onGallery: () => void;
  bottomOffset: number;
  visible: boolean;
};

export const MapFAB = memo(function MapFAB({
  onCamera,
  onGallery,
  bottomOffset,
  visible,
}: MapFABProps) {
  const [fabExpanded, setFabExpanded] = useState(false);
  const fabIconRotate = useRef(new Animated.Value(0)).current;
  const fabOverlayOpacity = useRef(new Animated.Value(0)).current;
  const fabCameraTranslateY = useRef(new Animated.Value(0)).current;
  const fabCameraOpacity = useRef(new Animated.Value(0)).current;
  const fabCameraScale = useRef(new Animated.Value(0.5)).current;
  const fabGalleryTranslateY = useRef(new Animated.Value(0)).current;
  const fabGalleryOpacity = useRef(new Animated.Value(0)).current;
  const fabGalleryScale = useRef(new Animated.Value(0.5)).current;

  const runOpenAnimation = useCallback(() => {
    Animated.parallel([
      Animated.timing(fabIconRotate, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fabOverlayOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(fabCameraTranslateY, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(fabCameraOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(fabCameraScale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.spring(fabGalleryTranslateY, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(fabGalleryOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(fabGalleryScale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [
    fabIconRotate,
    fabOverlayOpacity,
    fabCameraTranslateY,
    fabCameraOpacity,
    fabCameraScale,
    fabGalleryTranslateY,
    fabGalleryOpacity,
    fabGalleryScale,
  ]);

  const resetFabToClosed = useCallback(() => {
    fabIconRotate.stopAnimation();
    fabOverlayOpacity.stopAnimation();
    fabCameraTranslateY.stopAnimation();
    fabCameraOpacity.stopAnimation();
    fabCameraScale.stopAnimation();
    fabGalleryTranslateY.stopAnimation();
    fabGalleryOpacity.stopAnimation();
    fabGalleryScale.stopAnimation();

    setFabExpanded(false);
    fabIconRotate.setValue(0);
    fabOverlayOpacity.setValue(0);
    fabCameraTranslateY.setValue(0);
    fabCameraOpacity.setValue(0);
    fabCameraScale.setValue(0.5);
    fabGalleryTranslateY.setValue(0);
    fabGalleryOpacity.setValue(0);
    fabGalleryScale.setValue(0.5);
  }, [
    fabIconRotate,
    fabOverlayOpacity,
    fabCameraTranslateY,
    fabCameraOpacity,
    fabCameraScale,
    fabGalleryTranslateY,
    fabGalleryOpacity,
    fabGalleryScale,
  ]);

  const runCloseAnimation = useCallback(
    (onComplete?: () => void) => {
      Animated.parallel([
        Animated.timing(fabIconRotate, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fabOverlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fabCameraTranslateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fabCameraOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fabCameraScale, {
          toValue: 0.5,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fabGalleryTranslateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fabGalleryOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fabGalleryScale, {
          toValue: 0.5,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setFabExpanded(false);
        onComplete?.();
      });
    },
    [
      fabIconRotate,
      fabOverlayOpacity,
      fabCameraTranslateY,
      fabCameraOpacity,
      fabCameraScale,
      fabGalleryTranslateY,
      fabGalleryOpacity,
      fabGalleryScale,
    ]
  );

  useEffect(() => {
    if (fabExpanded) {
      runOpenAnimation();
    }
  }, [fabExpanded, runOpenAnimation]);

  const handleFabToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (fabExpanded) {
      runCloseAnimation();
    } else {
      setFabExpanded(true);
    }
  }, [fabExpanded, runCloseAnimation]);

  const handleFabOverlayPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    runCloseAnimation();
  }, [runCloseAnimation]);

  const handleCamera = useCallback(() => {
    resetFabToClosed();
    onCamera();
  }, [onCamera, resetFabToClosed]);

  const handleGallery = useCallback(() => {
    resetFabToClosed();
    onGallery();
  }, [onGallery, resetFabToClosed]);

  useFocusEffect(
    useCallback(() => {
      resetFabToClosed();
      return () => {
        resetFabToClosed();
      };
    }, [resetFabToClosed])
  );

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.fabRoot]} pointerEvents="box-none">
      {fabExpanded && (
        <Pressable
          style={[StyleSheet.absoluteFill, styles.fabOverlayPressable]}
          onPress={handleFabOverlayPress}
        >
          <Animated.View
            style={[
              styles.fabOverlay,
              {
                opacity: fabOverlayOpacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
            pointerEvents="none"
          />
        </Pressable>
      )}

      <View style={[styles.fabContainer, { bottom: bottomOffset }]}>
        <Animated.View
          style={[
            styles.fabSubButtonWrap,
            {
              transform: [
                {
                  translateY: fabCameraTranslateY.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -128],
                  }),
                },
                { scale: fabCameraScale },
              ],
              opacity: fabCameraOpacity,
            },
          ]}
          pointerEvents={fabExpanded ? 'auto' : 'none'}
        >
          <TouchableOpacity
            style={styles.fabSubButton}
            onPress={handleCamera}
            activeOpacity={0.7}
          >
            <Feather name="camera" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View
          style={[
            styles.fabSubButtonWrap,
            {
              transform: [
                {
                  translateY: fabGalleryTranslateY.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -68],
                  }),
                },
                { scale: fabGalleryScale },
              ],
              opacity: fabGalleryOpacity,
            },
          ]}
          pointerEvents={fabExpanded ? 'auto' : 'none'}
        >
          <TouchableOpacity
            style={styles.fabSubButton}
            onPress={handleGallery}
            activeOpacity={0.7}
          >
            <Feather name="image" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity
          style={[styles.fabButton, theme.shadows.button as object]}
          onPress={handleFabToggle}
          activeOpacity={0.8}
        >
          <Animated.View
            style={{
              transform: [
                {
                  rotate: fabIconRotate.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '45deg'],
                  }),
                },
              ],
            }}
          >
            <Feather name="plus" size={24} color="#FFF" />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  fabRoot: {
    zIndex: 100,
  },
  fabOverlayPressable: {
    zIndex: 1,
  },
  fabContainer: {
    position: 'absolute',
    right: 20,
    width: 56,
    alignItems: 'flex-end',
    zIndex: 10,
    elevation: 20,
  },
  fabOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  fabSubButtonWrap: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabSubButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    margin: 0,
    padding: 0,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
