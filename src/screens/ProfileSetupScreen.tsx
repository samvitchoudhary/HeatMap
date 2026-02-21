import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { StyledTextInput } from '../components/StyledTextInput';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { theme } from '../lib/theme';

const USERNAME_REGEX = /^[a-z0-9_]+$/;

export function ProfileSetupScreen() {
  const insets = useSafeAreaInsets();
  const { refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCompleteSetup() {
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedDisplayName = displayName.trim();

    if (!trimmedUsername) {
      Alert.alert('Error', 'Please enter a username.');
      return;
    }

    if (!USERNAME_REGEX.test(trimmedUsername)) {
      Alert.alert(
        'Invalid Username',
        'Username must be lowercase, with no spaces. Use only letters, numbers, and underscores.',
      );
      return;
    }

    if (!trimmedDisplayName) {
      Alert.alert('Error', 'Please enter a display name.');
      return;
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      Alert.alert('Error', 'You must be logged in to complete setup.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('profiles').insert({
        id: user.id,
        username: trimmedUsername,
        display_name: trimmedDisplayName,
      });
      if (error) throw error;
      await refreshProfile();
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code === '23505') {
        Alert.alert('Username Taken', 'This username is already in use. Please choose another.');
      } else {
        const message = err.message ?? 'An error occurred. Please try again.';
        showToast(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <View style={styles.form}>
        <Text style={styles.title}>HeatMap</Text>
        <Text style={styles.subtitle}>Profile Setup</Text>

        <StyledTextInput
          auth
          style={styles.input}
          placeholder="Username (lowercase, no spaces)"
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase())}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <StyledTextInput
          auth
          style={styles.input}
          placeholder="Display Name"
          value={displayName}
          onChangeText={setDisplayName}
        />

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleCompleteSetup}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <Text style={styles.buttonText}>Complete Setup</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  form: {
    width: '80%',
    maxWidth: 320,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 1,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  input: {
    marginBottom: theme.spacing.md,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: theme.spacing.sm,
    ...theme.shadows.button,
  },
  buttonDisabled: {
    opacity: 0.8,
  },
  buttonText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
