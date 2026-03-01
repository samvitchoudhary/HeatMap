import React, { useRef } from 'react';
import { Animated, View, StyleSheet, ImageProps } from 'react-native';
import { theme } from '../lib/theme';

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
  const opacity = useRef(new Animated.Value(0)).current;
  const mountTime = useRef(Date.now()).current;

  const handleLoad = (e: any) => {
    const loadTime = Date.now() - mountTime;
    const likelyCached = loadTime < CACHED_LOAD_THRESHOLD_MS;
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

  const handleError = (e: any) => {
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
