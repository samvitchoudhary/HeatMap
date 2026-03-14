/**
 * DeleteAccountScreen.tsx
 *
 * User must type "DELETE" to confirm account deletion.
 * Deletes all user data: posts, reactions, comments, notifications,
 * friendships, post_tags, storage images, profile, and auth account.
 */

import React, { useState } from 'react';
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

export function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const { profile, session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const isConfirmed = confirmText.trim().toUpperCase() === 'DELETE' && password.length > 0;

  const handleDeleteAccount = async () => {
    if (!isConfirmed) return;
    Keyboard.dismiss();

    Alert.alert(
      'Final Confirmation',
      'This will permanently delete your account and ALL your data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: performDeletion,
        },
      ]
    );
  };

  const performDeletion = async () => {
    if (!profile?.id || !session?.user?.id) return;
    setDeleting(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: session.user.email!,
        password: password,
      });
      if (authError) {
        Alert.alert('Incorrect Password', 'The password you entered is incorrect. Please try again.');
        setDeleting(false);
        return;
      }
    } catch {
      Alert.alert('Error', 'Could not verify your identity. Please try again.');
      setDeleting(false);
      return;
    }

    const userId = profile.id;

    try {
      // 1. Delete all post images from storage
      const { data: userPosts } = await supabase
        .from('posts')
        .select('id, image_url')
        .eq('user_id', userId);

      if (userPosts && userPosts.length > 0) {
        const storagePaths: string[] = [];
        for (const post of userPosts) {
          if (post.image_url) {
            try {
              const url = new URL(post.image_url);
              const pathParts = url.pathname.split('/posts/');
              if (pathParts[1]) {
                const path = pathParts[1].split('?')[0];
                if (path) storagePaths.push(path);
              }
            } catch {}
          }
        }
        if (storagePaths.length > 0) {
          await supabase.storage.from('posts').remove(storagePaths);
        }
      }

      // 2. Delete avatar from storage if exists
      if (profile.avatar_url) {
        try {
          const url = new URL(profile.avatar_url);
          const pathParts = url.pathname.split('/avatars/');
          if (pathParts[1]) {
            const path = pathParts[1].split('?')[0];
            if (path) {
              await supabase.storage.from('avatars').remove([path]);
            }
          }
        } catch {}
      }

      const postIds = (userPosts ?? []).map((p) => p.id);

      // 3. Delete user data from all tables
      await supabase.from('reactions').delete().eq('user_id', userId);
      if (postIds.length > 0) {
        await supabase.from('reactions').delete().in('post_id', postIds);
        await supabase.from('comments').delete().in('post_id', postIds);
        await supabase.from('post_tags').delete().in('post_id', postIds);
      }

      await supabase.from('comments').delete().eq('user_id', userId);
      await supabase.from('post_tags').delete().eq('tagged_user_id', userId);

      await supabase.from('notifications').delete().eq('user_id', userId);
      await supabase.from('notifications').delete().eq('from_user_id', userId);

      await supabase
        .from('friendships')
        .delete()
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      await supabase.from('posts').delete().eq('user_id', userId);
      await supabase.from('profiles').delete().eq('id', userId);

      // 4. Delete auth user via RPC
      try {
        await supabase.rpc('delete_user');
      } catch {
        // RPC doesn't exist — continue to sign out
      }

      // 5. Sign out
      await supabase.auth.signOut();
    } catch (err) {
      if (__DEV__) console.error('Account deletion failed:', err);
      Alert.alert(
        'Error',
        'Failed to delete account. Please try again or contact support.'
      );
      setDeleting(false);
      return;
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Warning */}
      <View style={styles.section}>
        <View style={styles.warningCard}>
          <Feather name="alert-triangle" size={24} color="#FF3B30" />
          <Text style={styles.warningTitle}>This is permanent</Text>
          <Text style={styles.warningText}>
            Deleting your account will permanently remove:
          </Text>
          <View style={styles.warningList}>
            <Text style={styles.warningItem}>• All your posts and photos</Text>
            <Text style={styles.warningItem}>• All your comments and reactions</Text>
            <Text style={styles.warningItem}>• All your friendships</Text>
            <Text style={styles.warningItem}>• Your profile and account info</Text>
            <Text style={styles.warningItem}>• All notifications</Text>
          </View>
          <Text style={[styles.warningText, { marginTop: 12, fontWeight: '600' }]}>
            This action cannot be undone. You will need to enter your password to
            confirm.
          </Text>
        </View>
      </View>

      {/* Password Verification */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>VERIFY YOUR IDENTITY</Text>
        <View style={styles.inputCard}>
          <TextInput
            style={styles.passwordInput}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={theme.colors.textTertiary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!deleting}
          />
        </View>
      </View>

      {/* Confirmation Input */}
      <View style={styles.section}>
        <Text style={styles.confirmLabel}>
          Type{' '}
          <Text style={{ fontWeight: '800', color: '#FF3B30' }}>DELETE</Text> to
          confirm
        </Text>
        <View style={styles.inputCard}>
          <TextInput
            style={styles.confirmInput}
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder="Type DELETE here"
            placeholderTextColor={theme.colors.textTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!deleting}
          />
        </View>
      </View>

      {/* Delete Button */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[
            styles.deleteButton,
            !isConfirmed && styles.deleteButtonDisabled,
            deleting && { opacity: 0.6 },
          ]}
          onPress={handleDeleteAccount}
          disabled={!isConfirmed || deleting}
          activeOpacity={0.8}
        >
          {deleting ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.deleteButtonText}>Deleting Account...</Text>
            </View>
          ) : (
            <Text style={styles.deleteButtonText}>Delete My Account</Text>
          )}
        </TouchableOpacity>
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
  warningCard: {
    backgroundColor: '#FF3B3010',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FF3B30',
    marginTop: 12,
  },
  warningText: {
    fontSize: 14,
    color: theme.colors.text,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  warningList: {
    alignSelf: 'flex-start',
    marginTop: 12,
    marginLeft: 16,
  },
  warningItem: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  passwordInput: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: theme.colors.text,
    textAlign: 'left',
  },
  confirmLabel: {
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: 8,
    marginLeft: 4,
  },
  inputCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  confirmInput: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    letterSpacing: 2,
    textAlign: 'center',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
