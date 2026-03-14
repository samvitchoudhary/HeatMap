/**
 * PrivacySettingsScreen.tsx
 *
 * Privacy settings: private account toggle.
 * When private, posts and gallery are hidden from non-friends.
 * Profile (name, avatar, username) is still visible.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

export function PrivacySettingsScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPrivacySetting = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_private')
        .eq('id', profile.id)
        .single();

      if (!error && data) {
        setIsPrivate(data.is_private ?? false);
      }
    } catch (err) {
      if (__DEV__) console.error('Failed to load privacy setting:', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.id) {
      loadPrivacySetting();
    }
  }, [profile?.id, loadPrivacySetting]);

  const togglePrivate = async (value: boolean) => {
    if (!profile?.id) return;
    setIsPrivate(value);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_private: value })
        .eq('id', profile.id);

      if (error) throw error;
    } catch (err) {
      if (__DEV__) console.error('Failed to update privacy setting:', err);
      setIsPrivate(!value);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[styles.container, styles.loadingContainer, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
    >
      {/* Private Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACCOUNT PRIVACY</Text>
        <View style={styles.sectionCard}>
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary + '15' }]}>
              <Feather name="lock" size={16} color={theme.colors.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Private Account</Text>
              <Text style={styles.rowDescription}>Only friends can see your posts and gallery</Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={togglePrivate}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '60' }}
              thumbColor={isPrivate ? theme.colors.primary : theme.colors.surface}
              ios_backgroundColor={theme.colors.border}
            />
          </View>
        </View>
      </View>

      {/* Explanation */}
      <View style={styles.section}>
        <View style={styles.infoCard}>
          <Feather
            name="info"
            size={16}
            color={theme.colors.textSecondary}
            style={{ marginTop: 2 }}
          />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>What does private mean?</Text>
            <View style={{ marginTop: 8 }}>
              <View style={styles.infoRow}>
                <Feather name="eye" size={13} color={theme.colors.textSecondary} />
                <Text style={styles.infoText}>
                  Your profile name, avatar, and username are always visible
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Feather name="eye-off" size={13} color={theme.colors.textSecondary} />
                <Text style={styles.infoText}>
                  Your posts and photo gallery are hidden from non-friends
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Feather name="map-pin" size={13} color={theme.colors.textSecondary} />
                <Text style={styles.infoText}>Your posts won't appear on the map for non-friends</Text>
              </View>
              <View style={styles.infoRow}>
                <Feather name="users" size={13} color={theme.colors.textSecondary} />
                <Text style={styles.infoText}>People can still send you friend requests</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {saving && (
        <View style={styles.savingIndicator}>
          <ActivityIndicator size="small" color={theme.colors.textTertiary} />
          <Text style={styles.savingText}>Saving...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
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
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowText: {
    flex: 1,
    marginRight: 8,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
  },
  rowDescription: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 16,
  },
  infoContent: {
    flex: 1,
    marginLeft: 10,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
    gap: 8,
  },
  infoText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 6,
  },
  savingText: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
});
