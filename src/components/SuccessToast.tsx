import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';

interface SuccessToastProps {
  message: string;
  visible: boolean;
  onHide: () => void;
}

export const SuccessToast: React.FC<SuccessToastProps> = ({ message, visible, onHide }) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      translateY.setValue(-100);
      opacity.setValue(0);
      checkScale.setValue(0);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 60,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.spring(checkScale, {
          toValue: 1,
          friction: 4,
          tension: 100,
          useNativeDriver: true,
        }).start();

        hideTimerRef.current = setTimeout(() => {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: -100,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]).start(() => {
            checkScale.setValue(0);
            onHide();
          });
        }, 2000);
      });
    }

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [visible, translateY, opacity, checkScale, onHide]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
        <Feather name="check" size={16} color="#FFF" />
      </Animated.View>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    alignSelf: 'center',
    backgroundColor: theme.colors.text,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.green,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  text: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
