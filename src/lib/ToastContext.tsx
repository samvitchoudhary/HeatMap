/**
 * ToastContext.tsx
 *
 * Global toast notification system.
 *
 * Key responsibilities:
 * - Provides showToast(message) to display a temporary banner
 * - Renders toast at top of screen with slide-in animation
 * - Auto-dismisses after 3 seconds
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from './theme';

type ToastContextValue = {
  showToast: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** How long the toast stays visible before sliding out */
const TOAST_DURATION_MS = 3000;

export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx ?? { showToast: () => {} };
}

/** Provider that renders toast banner and exposes showToast */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  /** Current toast message - null when hidden */
  const [message, setMessage] = useState<string | null>(null);
  /** Animates toast from off-screen (-100) to visible (0) */
  const translateY = useRef(new Animated.Value(-100)).current;
  /** Stores timeout ID for auto-dismiss so we can clear on new toast */
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const showToast = useCallback((msg: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setMessage(msg);
  }, []);

  useEffect(() => {
    if (!message) return;
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
    timeoutRef.current = setTimeout(() => {
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setMessage(null);
        }
      });
      timeoutRef.current = null;
    }, TOAST_DURATION_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [message, translateY]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message && (
        <Animated.View
          style={[
            styles.banner,
            {
              top: insets.top,
              width: width - theme.screenPadding * 2,
              marginHorizontal: theme.screenPadding,
              transform: [{ translateY }],
            },
          ]}
        >
          <Text style={styles.text} numberOfLines={2}>
            {message}
          </Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    zIndex: 9999,
    ...Platform.select({
      ios: { shadowColor: theme.colors.background, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, shadowOpacity: 0.4 },
      android: { elevation: 8 },
    }),
  },
  text: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    textAlign: 'center',
  },
});
