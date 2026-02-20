import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';

type AvatarProps = {
  uri: string | null;
  size: number;
};

export function Avatar({ uri, size }: AvatarProps) {
  const radius = size / 2;
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (uri) {
      setLoadError(false);
      imageOpacity.setValue(0);
      Animated.timing(imageOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      imageOpacity.setValue(0);
    }
  }, [uri, imageOpacity]);

  if (!uri || loadError) {
    return (
      <View
        style={[
          styles.placeholder,
          { width: size, height: size, borderRadius: radius },
        ]}
      >
        <Feather
          name={loadError ? 'image' : 'user'}
          size={loadError ? 24 : size * 0.45}
          color={theme.colors.textTertiary}
        />
      </View>
    );
  }
  return (
    <Animated.View
      style={[
        styles.imageWrap,
        { width: size, height: size, borderRadius: radius, opacity: imageOpacity },
      ]}
    >
      <Image
        source={{ uri }}
        style={[styles.image, { width: size, height: size, borderRadius: radius }]}
        resizeMode="cover"
        onError={() => setLoadError(true)}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    overflow: 'hidden',
  },
  image: {
    overflow: 'hidden',
  },
  placeholder: {
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
