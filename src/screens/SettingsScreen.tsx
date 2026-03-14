/**
 * SettingsScreen.tsx
 *
 * Main settings screen with grouped sections.
 * Each section navigates to a sub-screen.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { supabase } from '../lib/supabase';

type SettingsRow = {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  color?: string;
  showChevron?: boolean;
};

type SettingsSection = {
  title?: string;
  rows: SettingsRow[];
};

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const handleLogOut = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.auth.signOut();
            } catch (err) {
              if (__DEV__) console.error('Sign out failed:', err);
            }
          },
        },
      ]
    );
  };

  const sections: SettingsSection[] = [
    {
      title: 'GENERAL',
      rows: [
        {
          icon: 'user',
          label: 'Account',
          onPress: () => navigation.navigate('AccountSettings'),
          showChevron: true,
        },
        {
          icon: 'bell',
          label: 'Notifications',
          onPress: () => navigation.navigate('NotificationSettings'),
          showChevron: true,
        },
        {
          icon: 'lock',
          label: 'Privacy',
          onPress: () => navigation.navigate('PrivacySettings'),
          showChevron: true,
        },
        {
          icon: 'moon',
          label: 'Appearance',
          onPress: () => navigation.navigate('AppearanceSettings'),
          showChevron: true,
        },
      ],
    },
    {
      rows: [
        {
          icon: 'log-out',
          label: 'Log Out',
          onPress: handleLogOut,
          color: theme.colors.primary,
        },
      ],
    },
    {
      rows: [
        {
          icon: 'trash-2',
          label: 'Delete Account',
          onPress: () => navigation.navigate('DeleteAccount'),
          color: '#FF3B30',
          showChevron: true,
        },
      ],
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
    >
      {sections.map((section, sIdx) => (
        <View key={sIdx} style={styles.section}>
          {section.title && (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          <View style={styles.sectionCard}>
            {section.rows.map((row, rIdx) => (
              <TouchableOpacity
                key={rIdx}
                style={[
                  styles.row,
                  rIdx < section.rows.length - 1 && styles.rowBorder,
                ]}
                onPress={row.onPress}
                activeOpacity={0.6}
              >
                <View
                  style={[
                    styles.iconWrap,
                    {
                      backgroundColor:
                        (row.color ?? theme.colors.text) + '15',
                    },
                  ]}
                >
                  <Feather
                    name={row.icon}
                    size={18}
                    color={row.color ?? theme.colors.text}
                  />
                </View>
                <Text
                  style={[styles.rowLabel, row.color ? { color: row.color } : null]}
                >
                  {row.label}
                </Text>
                {row.showChevron && (
                  <Feather
                    name="chevron-right"
                    size={18}
                    color={theme.colors.textTertiary}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textTertiary,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
  },
});
