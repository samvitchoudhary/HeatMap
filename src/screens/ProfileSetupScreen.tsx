import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { theme } from '../lib/theme';

const USERNAME_REGEX = /^[a-z0-9_]+$/;

export function ProfileSetupScreen() {
  const { refreshProfile } = useAuth();
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
        Alert.alert('Setup Failed', message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.form}>
        <Text style={styles.title}>HeatMap</Text>
        <Text style={styles.subtitle}>Profile Setup</Text>

        <TextInput
          style={styles.input}
          placeholder="Username (lowercase, no spaces)"
          placeholderTextColor={theme.colors.textTertiary}
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase())}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          placeholder="Display Name"
          placeholderTextColor={theme.colors.textTertiary}
          value={displayName}
          onChangeText={setDisplayName}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleCompleteSetup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
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
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  button: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#000000',
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
});
