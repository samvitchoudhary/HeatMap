/**
 * ProfileHeader.tsx - Avatar, display name, username, stats, edit button.
 */

import React, { memo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { Avatar } from './Avatar';

type ProfileHeaderProps = {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  postCount: number;
  friendsCount: number;
  uploadingAvatar: boolean;
  onEditAvatar: () => void;
  onEditProfile: () => void;
  onFriendsPress: () => void;
};

export const ProfileHeader = memo(function ProfileHeader(props: ProfileHeaderProps) {
  const {
    displayName,
    username,
    avatarUrl,
    postCount,
    friendsCount,
    uploadingAvatar,
    onEditAvatar,
    onEditProfile,
    onFriendsPress,
  } = props;

  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.avatarWrapper}
        onPress={onEditAvatar}
        disabled={uploadingAvatar}
        activeOpacity={0.8}
      >
        <View style={styles.avatarContainer}>
          <Avatar uri={avatarUrl} size={80} profilePlaceholder />
          {uploadingAvatar && (
            <View style={styles.avatarLoadingOverlay}>
              <ActivityIndicator size="small" color={theme.colors.text} />
            </View>
          )}
        </View>
        <View style={styles.avatarBadge}>
          <Feather name="edit-2" size={12} color={theme.colors.textOnPrimary} />
        </View>
      </TouchableOpacity>
      <Text style={styles.displayName}>{displayName}</Text>
      <Text style={styles.username}>@{username}</Text>
      <View style={styles.statsRow}>
        <Text style={styles.statsNumber}>{postCount}</Text>
        <Text style={styles.statsLabel}> posts  </Text>
        <Text style={styles.statsDivider}> |  </Text>
        <TouchableOpacity style={styles.statTouchable} onPress={onFriendsPress} activeOpacity={0.7}>
          <Text style={[styles.statsNumber, styles.statsNumberTappable]}>{friendsCount}</Text>
          <Text style={[styles.statsLabel, styles.statsLabelTappable]}> friends</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.secondaryButton} onPress={onEditProfile} activeOpacity={0.8}>
        <Feather name="edit-2" size={14} color={theme.colors.text} />
        <Text style={styles.secondaryButtonText}>Edit Profile</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.screenPadding,
  },
  avatarWrapper: { position: 'relative', marginBottom: theme.spacing.sm },
  avatarContainer: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden' },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlayMedium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  displayName: { fontSize: 22, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  username: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  statsRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: theme.spacing.lg },
  statTouchable: { flexDirection: 'row', alignItems: 'baseline' },
  statsNumber: { fontSize: theme.fontSize.md, fontWeight: '700', color: theme.colors.text },
  statsNumberTappable: { color: theme.colors.primary },
  statsLabel: { fontSize: theme.fontSize.xs, fontWeight: '400', color: theme.colors.textSecondary },
  statsLabelTappable: { color: theme.colors.primary },
  statsDivider: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginHorizontal: 4 },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: theme.button.secondaryHeight,
    paddingHorizontal: theme.spacing.md,
    borderRadius: 14,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
});
