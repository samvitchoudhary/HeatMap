/**
 * TagFriendsPicker.tsx
 *
 * Modal for selecting friends to tag in a post.
 * Extracted from UploadScreen.
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { StyledTextInput } from './StyledTextInput';
import { Avatar } from './Avatar';

type Friend = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type TagFriendsPickerProps = {
  visible: boolean;
  friends: Friend[];
  loading: boolean;
  selectedFriends: { id: string; display_name: string; username: string }[];
  onToggleFriend: (friend: Friend) => void;
  onClose: () => void;
  searchText: string;
  onSearchChange: (text: string) => void;
};

export const TagFriendsPicker = memo(function TagFriendsPicker({
  visible,
  friends,
  loading,
  selectedFriends,
  onToggleFriend,
  onClose,
  searchText,
  onSearchChange,
}: TagFriendsPickerProps) {
  const filtered = friends.filter(
    (f) =>
      !searchText.trim() ||
      f.display_name.toLowerCase().includes(searchText.toLowerCase()) ||
      f.username.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Tag Friends</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Feather name="x" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.searchWrap}>
          <Feather name="search" size={18} color={theme.colors.textTertiary} />
          <StyledTextInput
            auth
            style={styles.searchInput}
            placeholder="Search friends..."
            value={searchText}
            onChangeText={onSearchChange}
          />
        </View>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {filtered.map((friend) => {
              const isTagged = selectedFriends.some((t) => t.id === friend.id);
              return (
                <TouchableOpacity
                  key={friend.id}
                  style={styles.row}
                  onPress={() => onToggleFriend(friend)}
                  activeOpacity={0.7}
                >
                  <Avatar uri={friend.avatar_url} size={24} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {friend.display_name}
                    </Text>
                    <Text style={styles.rowUsername} numberOfLines={1}>
                      @{friend.username}
                    </Text>
                  </View>
                  {isTagged ? (
                    <Feather name="check" size={20} color={theme.colors.primary} />
                  ) : (
                    <View style={styles.rowEmpty} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.screenPadding,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: theme.screenPadding,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    padding: 0,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.screenPadding,
    paddingBottom: theme.spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  rowUsername: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  rowEmpty: {
    width: 20,
  },
  doneBtn: {
    backgroundColor: theme.colors.primary,
    marginHorizontal: theme.screenPadding,
    marginBottom: theme.spacing.lg,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.button,
  },
  doneText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
