/**
 * LoginScreen.tsx
 *
 * Authentication - email/username + password login.
 *
 * Key responsibilities:
 * - Accepts email or username (looks up email from profiles if username)
 * - Supabase signInWithPassword; auth state change triggers navigation to MainTabs
 * - Links to SignUp screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/ToastContext';
import { StyledTextInput } from '../components/StyledTextInput';
import { theme } from '../lib/theme';
import { withRetry } from '../lib/retry';

type LoginNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

/** Login screen - email/username + password form */
export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<LoginNavigationProp>();
  const { showToast } = useToast();
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => {
      if (Date.now() >= lockedUntil) {
        setLockedUntil(null);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  /** Validates input, resolves username→email if needed, calls signInWithPassword */
  async function handleLogin() {
    if (lockedUntil && Date.now() < lockedUntil) {
      const secondsLeft = Math.ceil((lockedUntil - Date.now()) / 1000);
      Alert.alert('Too Many Attempts', `Please wait ${secondsLeft} seconds before trying again.`);
      return;
    }

    const input = emailOrUsername.trim();
    if (!input) {
      Alert.alert('Error', 'Please enter your email or username.');
      return;
    }

    if (!password) {
      Alert.alert('Error', 'Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      let emailToUse = input;

      if (!input.includes('@')) {
        const { data: email, error: rpcError } = await supabase.rpc('get_email_by_username', {
          lookup_username: input.toLowerCase(),
        });

        if (rpcError || !email) {
          showToast('Invalid username or password.');
          setLoading(false);
          return;
        }
        emailToUse = email;
      } else {
        emailToUse = input.toLowerCase();
      }

      const { error } = await withRetry(async () => {
        const result = await supabase.auth.signInWithPassword({
          email: emailToUse,
          password,
        });
        if (result.error) throw result.error;
        return result;
      });
      if (error) throw error;

      setFailedAttempts(0);
      setLockedUntil(null);
    } catch (err: any) {
      const attempts = failedAttempts + 1;
      setFailedAttempts(attempts);

      if (attempts >= 5) {
        const lockoutSeconds = 30 * Math.pow(2, attempts - 5);
        const maxLockout = 300;
        const lockoutMs = Math.min(lockoutSeconds, maxLockout) * 1000;
        setLockedUntil(Date.now() + lockoutMs);
      }

      const message = err?.message ?? '';

      if (message.includes('Invalid login credentials')) {
        showToast('Invalid username or password.');
      } else if (message.includes('Email not confirmed')) {
        Alert.alert('Error', 'Please confirm your email address before logging in.');
      } else if (message.includes('Too many requests') || message.includes('rate limit')) {
        Alert.alert('Too Many Attempts', 'Please wait a moment before trying again.');
      } else if (message.includes('network') || message.includes('fetch')) {
        Alert.alert('Connection Error', 'Please check your internet connection and try again.');
      } else {
        showToast('Something went wrong. Please try again.');
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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.dismissArea}>
          <View style={styles.form}>
        <Text style={styles.title}>HeatMap</Text>
        <Text style={styles.tagline}>See where your friends are</Text>

        <StyledTextInput
          auth
          style={styles.input}
          placeholder="Email or username"
          value={emailOrUsername}
          onChangeText={setEmailOrUsername}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <StyledTextInput
          auth
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (loading || (lockedUntil !== null && Date.now() < lockedUntil)) && { opacity: 0.5 },
          ]}
          onPress={handleLogin}
          disabled={loading || (lockedUntil !== null && Date.now() < lockedUntil)}
          activeOpacity={0.9}
        >
          {lockedUntil !== null && Date.now() < lockedUntil ? (
            <Text style={styles.buttonText}>Try again later</Text>
          ) : loading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <Text style={styles.buttonText}>Log In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.link}
          onPress={() => navigation.navigate('SignUp')}
          activeOpacity={0.6}
        >
          <Text style={styles.linkText}>Don't have an account? Sign up</Text>
        </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissArea: {
    flex: 1,
    width: '100%',
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
    color: theme.colors.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  tagline: {
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
  link: {
    marginTop: theme.spacing.lg,
    alignItems: 'center',
  },
  linkText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
  },
});
