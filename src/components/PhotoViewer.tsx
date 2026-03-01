/**
 * PhotoViewer.tsx
 *
 * Full-screen modal photo viewer with pinch-to-zoom and pan.
 *
 * Key responsibilities:
 * - Pinch to zoom (1x–3x), pan when zoomed
 * - Swipe down to dismiss (when at 1x zoom)
 * - Double-tap toggles 1x/2x zoom; single tap toggles close button visibility
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  TouchableOpacity,
  Modal,
  StatusBar,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Euclidean distance between two points - used for pinch gesture */
function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

type PhotoViewerProps = {
  imageUrl: string;
  onClose: () => void;
};

/** Full-screen photo viewer with pinch/pan gestures */
export function PhotoViewer({ imageUrl, onClose }: PhotoViewerProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  /** Overlay opacity - fades on swipe-down to dismiss */
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  /** Whether close button is visible - toggled by single tap */
  const [showUI, setShowUI] = useState(true);

  // Gesture state refs - updated during pan, read on release
  const baseScale = useRef(1);
  const baseTranslateX = useRef(0);
  const baseTranslateY = useRef(0);
  const lastPinchDistance = useRef(0);
  const initialPinchScale = useRef(1);
  const scaleValueRef = useRef(1);
  const lastTapTime = useRef(0);
  /** Distinguishes tap from swipe - used for double-tap vs dismiss */
  const didMoveRef = useRef(false);

  /** Resets zoom and pan to initial state */
  const resetTransforms = useCallback(() => {
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    baseScale.current = 1;
    baseTranslateX.current = 0;
    baseTranslateY.current = 0;
    scaleValueRef.current = 1;
  }, [scale, translateX, translateY]);

  const handleClose = useCallback(() => {
    resetTransforms();
    onClose();
  }, [resetTransforms, onClose]);

  /** Double-tap: zoom to 2x if at 1x, reset to 1x if zoomed */
  const animateDoubleTapZoom = useCallback(() => {
    const currentScale = baseScale.current;
    const newScale = currentScale < 1.5 ? 2 : 1;
    baseScale.current = newScale;
    baseTranslateX.current = 0;
    baseTranslateY.current = 0;
    scaleValueRef.current = newScale;
    Animated.parallel([
      Animated.spring(scale, {
        toValue: newScale,
        useNativeDriver: true,
        speed: 50,
        bounciness: 8,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        speed: 50,
        bounciness: 8,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        speed: 50,
        bounciness: 8,
      }),
    ]).start();
  }, [scale, translateX, translateY]);

  /** Handles pinch (2 fingers), pan (when zoomed), swipe-down (dismiss), tap/double-tap */
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => {
        const { dx, dy, numberActiveTouches } = gesture;
        if (numberActiveTouches === 2) return true;
        if (numberActiveTouches === 1 && baseScale.current > 1) return true;
        if (numberActiveTouches === 1 && Math.abs(dy) > 8) return true;
        if (numberActiveTouches === 1 && (Math.abs(dx) > 8 || Math.abs(dy) > 8))
          return true;
        return false;
      },
      onPanResponderGrant: (_, gesture) => {
        didMoveRef.current = false;
        if (gesture.numberActiveTouches === 2) {
          const touches = gesture._activeTouches;
          if (touches.length >= 2) {
            const dist = getDistance(
              touches[0].pageX,
              touches[0].pageY,
              touches[1].pageX,
              touches[1].pageY
            );
            lastPinchDistance.current = dist;
            initialPinchScale.current = baseScale.current;
          }
        }
      },
      onPanResponderMove: (_, gesture) => {
        const { numberActiveTouches, dx, dy } = gesture;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          didMoveRef.current = true;
        }

        if (numberActiveTouches === 2) {
          const touches = gesture._activeTouches;
          if (touches.length >= 2) {
            const dist = getDistance(
              touches[0].pageX,
              touches[0].pageY,
              touches[1].pageX,
              touches[1].pageY
            );
            if (lastPinchDistance.current > 0) {
              const factor = dist / lastPinchDistance.current;
              const newScale = Math.min(
                3,
                Math.max(1, initialPinchScale.current * factor)
              );
              scale.setValue(newScale);
              scaleValueRef.current = newScale;
            }
            lastPinchDistance.current = dist;
          }
        } else if (numberActiveTouches === 1) {
          if (baseScale.current > 1) {
            const newX = baseTranslateX.current + dx;
            const newY = baseTranslateY.current + dy;
            translateX.setValue(newX);
            translateY.setValue(newY);
          } else {
            if (dy > 0) {
              const opacity = Math.max(0.3, 1 - dy / 400);
              overlayOpacity.setValue(opacity);
              translateY.setValue(dy);
            }
          }
        }
      },
      onPanResponderRelease: (_, gesture) => {
        const { dx, dy } = gesture;
        const zoomed = scaleValueRef.current > 1;

        if (zoomed) {
          baseTranslateX.current += dx;
          baseTranslateY.current += dy;
          baseScale.current = scaleValueRef.current;
        } else {
          if (dy > 120 && didMoveRef.current) {
            Animated.timing(overlayOpacity, {
              toValue: 0,
              duration: 150,
              useNativeDriver: true,
            }).start(() => handleClose());
            return;
          }
          translateY.setValue(0);
          overlayOpacity.setValue(1);
          Animated.parallel([
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              speed: 50,
              bounciness: 10,
            }),
            Animated.timing(overlayOpacity, {
              toValue: 1,
              duration: 150,
              useNativeDriver: true,
            }),
          ]).start();
        }

        if (!didMoveRef.current && Math.abs(dx) < 15 && Math.abs(dy) < 15) {
          const now = Date.now();
          const isDoubleTap = now - lastTapTime.current < 300;
          lastTapTime.current = now;
          if (isDoubleTap) {
            animateDoubleTapZoom();
          } else {
            setShowUI((s) => !s);
          }
        }
      },
    })
  ).current;

  return (
    <Modal
      visible={!!imageUrl}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <StatusBar hidden />
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
          <Animated.View
            style={[styles.overlay, { opacity: overlayOpacity }]}
            pointerEvents="none"
          />
          <View style={styles.imageWrap} pointerEvents="none">
            <Animated.Image
              source={{ uri: imageUrl }}
              style={[
                styles.image,
                {
                  transform: [
                    { scale },
                    { translateX },
                    { translateY },
                  ],
                },
              ]}
              resizeMode="contain"
            />
          </View>
        </View>

        {showUI && (
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <Feather name="x" size={22} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  imageWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 44,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});
