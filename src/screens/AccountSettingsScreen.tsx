/**
 * AccountSettingsScreen.tsx
 *
 * Edit account info: display name, username, email, password.
 * Each field is editable inline with a save button.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

export function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { profile, session, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [email, setEmail] = useState(session?.user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Sync from profile/session when they load
  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
    setUsername(profile?.username ?? '');
    setEmail(session?.user?.email ?? '');
  }, [profile?.display_name, profile?.username, session?.user?.email]);

  // Track changes
  useEffect(() => {
    const changed =
      displayName !== (profile?.display_name ?? '') ||
      username !== (profile?.username ?? '') ||
      email !== (session?.user?.email ?? '');
    setHasChanges(changed);
  }, [displayName, username, email, profile, session]);

  const handleSave = async () => {
    Keyboard.dismiss();

    if (!displayName.trim()) {
      Alert.alert('Error', 'Display name cannot be empty.');
      return;
    }
    if (!username.trim()) {
      Alert.alert('Error', 'Username cannot be empty.');
      return;
    }
    if (username.trim().length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters.');
      return;
    }

    setSaving(true);
    try {
      // Check if username is taken (if changed)
      if (username.trim().toLowerCase() !== profile?.username) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username.trim().toLowerCase())
          .neq('id', profile?.id ?? '')
          .maybeSingle();

        if (existing) {
          Alert.alert('Error', 'This username is already taken.');
          setSaving(false);
          return;
        }
      }

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          username: username.trim().toLowerCase(),
        })
        .eq('id', profile?.id);

      if (profileError) throw profileError;
      await refreshProfile();

      // Update email if changed
      if (email.trim() !== (session?.user?.email ?? '')) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: email.trim(),
        });
        if (emailError) throw emailError;
        Alert.alert('Email Updated', 'A confirmation link has been sent to your new email address.');
      } else {
        Alert.alert('Success', 'Account info updated.');
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505'
          ? 'This username is already taken.'
          : err instanceof Error ? err.message : 'Failed to update account info.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    Keyboard.dismiss();

    if (!currentPassword) {
      Alert.alert('Error', 'Please enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: session?.user?.email!,
        password: currentPassword,
      });
      if (authError) {
        Alert.alert('Error', 'Current password is incorrect.');
        setChangingPassword(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      Alert.alert('Success', 'Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to change password.';
      Alert.alert('Error', message);
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Profile Fields */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PROFILE</Text>
        <View style={styles.sectionCard}>
          {/* Display Name */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Display Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={theme.colors.textTertiary}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.fieldDivider} />

          {/* Username */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput
              style={styles.fieldInput}
              value={username}
              onChangeText={(text) =>
                setUsername(text.toLowerCase().replace(/[^a-z0-9._]/g, ''))
              }
              placeholder="username"
              placeholderTextColor={theme.colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>
      </View>

      {/* Email */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>EMAIL</Text>
        <View style={styles.sectionCard}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.fieldInput}
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              placeholderTextColor={theme.colors.textTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>
        </View>
      </View>

      {/* Save Button */}
      {hasChanges && (
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Password */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PASSWORD</Text>
        <View style={styles.sectionCard}>
          {!showPasswordChange ? (
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() => setShowPasswordChange(true)}
              activeOpacity={0.6}
            >
              <Text style={styles.fieldLabel}>Change Password</Text>
              <Feather name="chevron-right" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Current</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Current password"
                  placeholderTextColor={theme.colors.textTertiary}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.fieldDivider} />
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>New Password</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Min 6 characters"
                  placeholderTextColor={theme.colors.textTertiary}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.fieldDivider} />
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Confirm</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter password"
                  placeholderTextColor={theme.colors.textTertiary}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.fieldDivider} />
              <View style={styles.passwordButtons}>
                <TouchableOpacity
                  style={[styles.passwordButton, styles.passwordButtonSecondary]}
                  onPress={() => {
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setShowPasswordChange(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.passwordButtonText, { color: theme.colors.text }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.passwordButton,
                    styles.passwordButtonPrimary,
                    changingPassword && { opacity: 0.6 },
                  ]}
                  onPress={handleChangePassword}
                  disabled={changingPassword}
                  activeOpacity={0.8}
                >
                  {changingPassword ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.passwordButtonText, { color: '#FFFFFF' }]}>
                      Update
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
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
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    width: 110,
  },
  fieldInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    textAlign: 'right',
    padding: 0,
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.borderLight,
    marginLeft: 16,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  passwordButtons: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  passwordButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  passwordButtonSecondary: {
    backgroundColor: theme.colors.surface,
  },
  passwordButtonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  passwordButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
