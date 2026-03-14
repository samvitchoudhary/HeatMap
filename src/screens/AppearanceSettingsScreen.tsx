import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';

export function AppearanceSettingsScreen() {
  return (
    <View style={styles.container}>
      <Feather name="moon" size={40} color={theme.colors.textTertiary} />
      <Text style={styles.title}>Coming Soon</Text>
      <Text style={styles.subtitle}>
        Dark mode and theme customization will be available in a future update.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
