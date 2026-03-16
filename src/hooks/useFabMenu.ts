/**
 * useFabMenu.ts
 *
 * Manages the floating action button menu: expanded state,
 * open/close/reset animations for the main button, camera sub-button,
 * and gallery sub-button.
 */

import { useState, useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

export function useFabMenu() {
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
      Animated.timing(fabIconRotate, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(fabOverlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(fabCameraTranslateY, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(fabCameraOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(fabCameraScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.spring(fabGalleryTranslateY, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(fabGalleryOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(fabGalleryScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
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
        Animated.timing(fabIconRotate, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fabOverlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fabCameraTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fabCameraOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fabCameraScale, { toValue: 0.5, duration: 200, useNativeDriver: true }),
        Animated.timing(fabGalleryTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fabGalleryOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fabGalleryScale, { toValue: 0.5, duration: 200, useNativeDriver: true }),
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

  const toggleFab = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (fabExpanded) {
      runCloseAnimation();
    } else {
      setFabExpanded(true);
    }
  }, [fabExpanded, runCloseAnimation]);

  const dismissFab = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    runCloseAnimation();
  }, [runCloseAnimation]);

  return {
    fabExpanded,
    toggleFab,
    dismissFab,
    resetFabToClosed,
    runOpenAnimation,
    fabIconRotate,
    fabOverlayOpacity,
    fabCameraTranslateY,
    fabCameraOpacity,
    fabCameraScale,
    fabGalleryTranslateY,
    fabGalleryOpacity,
    fabGalleryScale,
  };
}

