/**
 * NotificationSettingsScreen.tsx
 *
 * Toggle notification preferences: master toggle + individual toggles
 * for reactions, comments, friend requests, and tags.
 * Saved to profiles.notification_prefs jsonb column.
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

type NotificationPrefs = {
  all: boolean;
  reactions: boolean;
  comments: boolean;
  friend_requests: boolean;
  tags: boolean;
};

const DEFAULT_PREFS: NotificationPrefs = {
  all: true,
  reactions: true,
  comments: true,
  friend_requests: true,
  tags: true,
};

type ToggleRow = {
  key: keyof Omit<NotificationPrefs, 'all'>;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Feather>['name'];
};

const TOGGLE_ROWS: ToggleRow[] = [
  { key: 'reactions', label: 'Reactions', description: 'When someone reacts to your post', icon: 'heart' },
  { key: 'comments', label: 'Comments', description: 'When someone comments on your post', icon: 'message-circle' },
  {
    key: 'friend_requests',
    label: 'Friend Requests',
    description: 'When someone sends you a friend request',
    icon: 'user-plus',
  },
  { key: 'tags', label: 'Tags', description: 'When someone tags you in a post', icon: 'tag' },
];

export function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPrefs = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_prefs')
        .eq('id', profile.id)
        .single();

      if (!error && data?.notification_prefs) {
        setPrefs({ ...DEFAULT_PREFS, ...data.notification_prefs });
      }
    } catch (err) {
      if (__DEV__) console.error('Failed to load notification prefs:', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.id) {
      loadPrefs();
    }
  }, [profile?.id, loadPrefs]);

  const savePrefs = useCallback(
    async (newPrefs: NotificationPrefs) => {
      if (!profile?.id) return;
      setSaving(true);
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ notification_prefs: newPrefs })
          .eq('id', profile.id);

        if (error) throw error;
      } catch (err) {
        if (__DEV__) console.error('Failed to save notification prefs:', err);
      } finally {
        setSaving(false);
      }
    },
    [profile?.id]
  );

  const toggleMaster = (value: boolean) => {
    const newPrefs = { ...prefs, all: value };
    setPrefs(newPrefs);
    savePrefs(newPrefs);
  };

  const toggleIndividual = (key: keyof Omit<NotificationPrefs, 'all'>, value: boolean) => {
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    savePrefs(newPrefs);
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
      {/* Master Toggle */}
      <View style={styles.section}>
        <View style={styles.sectionCard}>
          <View style={styles.masterRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.masterLabel}>Notifications</Text>
              <Text style={styles.masterDescription}>
                {prefs.all ? 'You will receive notifications' : 'All notifications are paused'}
              </Text>
            </View>
            <Switch
              value={prefs.all}
              onValueChange={toggleMaster}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '60' }}
              thumbColor={prefs.all ? theme.colors.primary : theme.colors.surface}
              ios_backgroundColor={theme.colors.border}
            />
          </View>
        </View>
      </View>

      {/* Individual Toggles */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>NOTIFY ME ABOUT</Text>
        <View style={[styles.sectionCard, !prefs.all && styles.disabledCard]}>
          {TOGGLE_ROWS.map((row, index) => (
            <View key={row.key}>
              {index > 0 && <View style={styles.divider} />}
              <View style={styles.toggleRow}>
                <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary + '15' }]}>
                  <Feather
                    name={row.icon}
                    size={16}
                    color={prefs.all ? theme.colors.primary : theme.colors.textTertiary}
                  />
                </View>
                <View style={styles.toggleText}>
                  <Text style={[styles.toggleLabel, !prefs.all && styles.disabledText]}>{row.label}</Text>
                  <Text style={[styles.toggleDescription, !prefs.all && styles.disabledText]}>
                    {row.description}
                  </Text>
                </View>
                <Switch
                  value={prefs[row.key]}
                  onValueChange={(value) => toggleIndividual(row.key, value)}
                  disabled={!prefs.all}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary + '60' }}
                  thumbColor={
                    prefs[row.key] && prefs.all ? theme.colors.primary : theme.colors.surface
                  }
                  ios_backgroundColor={theme.colors.border}
                />
              </View>
            </View>
          ))}
        </View>
        {!prefs.all && (
          <Text style={styles.disabledHint}>
            Turn on notifications above to customize individual preferences.
          </Text>
        )}
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
  disabledCard: {
    opacity: 0.5,
  },
  masterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  masterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  masterDescription: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
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
  toggleText: {
    flex: 1,
    marginRight: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  toggleDescription: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  disabledText: {
    color: theme.colors.textTertiary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.borderLight,
    marginLeft: 60,
  },
  disabledHint: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 8,
    marginLeft: 4,
    fontStyle: 'italic',
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
