/**
 * useCardSwipe.ts
 *
 * Extracts gesture/pan/swipe logic from CardStack.
 * Handles horizontal swipe navigation, shake animation, end-of-stack message.
 */

import { useState, useRef, useCallback } from 'react';
import { Animated, PanResponder } from 'react-native';
import * as Haptics from 'expo-haptics';

const SWIPE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 0.3;

export function useCardSwipe(
  postsCount: number,
  currentIndex: number,
  options: {
    isFlipped: (postId: string) => boolean;
    postsRef: React.MutableRefObject<any[]>;
    onIndexChange: (updater: (prev: number) => number) => void;
  }
) {
  const { isFlipped, postsRef, onIndexChange } = options;
  const [showEndMessage, setShowEndMessage] = useState(false);

  const pan = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const endMessageOpacity = useRef(new Animated.Value(0)).current;
  const currentIndexRef = useRef(currentIndex);
  const postsLengthRef = useRef(postsCount);
  const onIndexChangeRef = useRef(onIndexChange);
  const isFlippedRef = useRef(isFlipped);

  currentIndexRef.current = currentIndex;
  postsLengthRef.current = postsCount;
  onIndexChangeRef.current = onIndexChange;
  isFlippedRef.current = isFlipped;

  const triggerShake = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const showEndMessageAndFade = useCallback(() => {
    setShowEndMessage(true);
    endMessageOpacity.setValue(1);
    setTimeout(() => {
      Animated.timing(endMessageOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowEndMessage(false));
    }, 1500);
  }, [endMessageOpacity]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        const currentPost = postsRef.current[currentIndexRef.current];
        if (currentPost && isFlippedRef.current(currentPost.id)) return false;
        const { dx, dy } = gesture;
        if (
          postsLengthRef.current > 1 &&
          Math.abs(dx) > 10 &&
          Math.abs(dx) > Math.abs(dy)
        ) {
          return true;
        }
        return false;
      },
      onPanResponderMove: (_, gesture) => {
        pan.setValue(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        const len = postsLengthRef.current;
        if (len === 0) return;
        const isFirst = currentIndexRef.current === 0;
        const isLast = currentIndexRef.current === len - 1;
        const swipedLeft =
          gesture.dx < -SWIPE_THRESHOLD || gesture.vx < -VELOCITY_THRESHOLD;
        const swipedRight =
          gesture.dx > SWIPE_THRESHOLD || gesture.vx > VELOCITY_THRESHOLD;

        if (swipedLeft && !isLast) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.timing(pan, {
            toValue: -400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onIndexChangeRef.current((prev) => prev + 1);
            pan.setValue(0);
          });
        } else if (swipedRight && !isFirst) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.timing(pan, {
            toValue: 400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onIndexChangeRef.current((prev) => prev - 1);
            pan.setValue(0);
          });
        } else if ((swipedLeft && isLast) || (swipedRight && isFirst)) {
          triggerShake();
          if (swipedLeft && isLast) {
            showEndMessageAndFade();
          }
          Animated.spring(pan, {
            toValue: 0,
            friction: 8,
            tension: 100,
            useNativeDriver: true,
          }).start();
        } else {
          Animated.spring(pan, {
            toValue: 0,
            friction: 8,
            tension: 80,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  return {
    pan,
    shakeAnim,
    panResponder,
    showEndMessage,
    endMessageOpacity,
    triggerShake,
  };
}
