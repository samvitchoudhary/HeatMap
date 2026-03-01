/**
 * TabSwipeOverlay.tsx
 *
 * Invisible edge zones for swipe-between-tabs navigation.
 *
 * Key responsibilities:
 * - Left edge: swipe right to go to previous tab
 * - Right edge: swipe left to go to next tab
 * - Disabled when CardStack is open (no accidental tab switch during post view)
 */

import React, { useRef } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ParamListBase } from '@react-navigation/native';
import type { MainTabParamList } from '../navigation/types';
import { useCardStack } from '../lib/CardStackContext';

const TAB_ORDER: (keyof MainTabParamList)[] = ['Map', 'Feed', 'Notifications', 'Profile'];
/** Width of each swipe-sensitive edge in pixels */
const EDGE_WIDTH = 20;
/** Horizontal swipe distance required to trigger tab change */
const SWIPE_THRESHOLD = 60;

type TabSwipeOverlayProps = {
  navigation: BottomTabNavigationProp<MainTabParamList>;
  state: { index: number; routes: { name: string }[] };
};

/** Overlay with left/right edge pan responders for tab swiping */
export function TabSwipeOverlay({ navigation, state }: TabSwipeOverlayProps) {
  const { cardStackOpen } = useCardStack();
  const currentIndex = state?.index ?? 0;
  /** Refs used in PanResponder callbacks to avoid stale closures */
  const indexRef = useRef(currentIndex);
  const canSwipeRef = useRef(!cardStackOpen);

  indexRef.current = currentIndex;
  const canSwipe = !cardStackOpen;
  canSwipeRef.current = canSwipe;

  const leftEdgePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => canSwipeRef.current && indexRef.current > 0,
      onMoveShouldSetPanResponder: () => false,
      onPanResponderRelease: (e, g) => {
        if (!canSwipeRef.current) return;
        const dx = g.dx;
        if (dx > SWIPE_THRESHOLD && indexRef.current > 0) {
          navigation.navigate(TAB_ORDER[indexRef.current - 1]);
        }
      },
    })
  ).current;

  const rightEdgePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () =>
        canSwipeRef.current && indexRef.current < TAB_ORDER.length - 1,
      onMoveShouldSetPanResponder: () => false,
      onPanResponderRelease: (e, g) => {
        if (!canSwipeRef.current) return;
        const dx = g.dx;
        if (dx < -SWIPE_THRESHOLD && indexRef.current < TAB_ORDER.length - 1) {
          navigation.navigate(TAB_ORDER[indexRef.current + 1]);
        }
      },
    })
  ).current;

  if (!canSwipe) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View
        style={[styles.edge, styles.leftEdge]}
        {...leftEdgePanResponder.panHandlers}
      />
      <View
        style={[styles.edge, styles.rightEdge]}
        {...rightEdgePanResponder.panHandlers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  edge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: EDGE_WIDTH,
  },
  leftEdge: {
    left: 0,
  },
  rightEdge: {
    right: 0,
  },
});
