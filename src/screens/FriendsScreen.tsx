/**
 * FriendsScreen.tsx
 *
 * NOTE: This file is over 500 lines. Future refactoring candidates:
 * - Extract useProfileSearch hook (debounced search, searchText, searchProfiles, loading state)
 * - Extract useFriendshipActions hook (addFriend, acceptRequest, shared with FriendProfileScreen)
 * - Extract FriendshipButton component (Add / Accept / Pending / Friends button variants)
 *
 * Friends list and user search.
 *
 * Key responsibilities:
 * - Lists accepted friends with avatars; tap navigates to FriendProfileScreen
 * - Search by username (debounced); Add / Pending / Friends / Accept buttons
 * - Fetches friendships and profiles; handles friend request flow
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ProfileStackParamList, RootStackNavigationProp } from '../navigation/types';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  StyleSheet,
  FlatList,
  Platform,
  Alert,
  ScrollView,
  RefreshControl,
  Keyboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { useFriends } from '../hooks';
import { supabase } from '../lib/supabase';
import { shouldSendNotification } from '../lib/notifications';
import { theme } from '../lib/theme';
import type { Profile, Friendship } from '../types';
import { Skeleton } from '../components/Skeleton';
import { Avatar } from '../components/Avatar';
import { StyledTextInput } from '../components/StyledTextInput';

type FriendshipWithProfile = Friendship & {
  
  other_user: Profile;
};

type SearchResultWithStatus = Profile & {
  buttonState: 'add' | 'pending' | 'friends' | 'accept';
  friendshipId?: string;
};

/** Debounce search input before querying profiles */
const DEBOUNCE_MS = 500;

type FriendsScreenNav = NativeStackNavigationProp<ProfileStackParamList, 'Friends'>;

export function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<FriendsScreenNav>();
  const { session } = useAuth();
  const { showToast } = useToast();
  const userId = session?.user?.id;
  const { friends: friendsFromContext, loading: friendsLoading, refresh: refreshFriends } = useFriends();
  const [refreshing, setRefreshing] = useState(false);

  const [searchFocused, setSearchFocused] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchProfiles, setSearchProfiles] = useState<Profile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResultsVisible, setSearchResultsVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [friendships, setFriendships] = useState<Friendship[]>([]);

  const searchResults: SearchResultWithStatus[] = React.useMemo(() => {
    const list = friendships ?? [];
    return searchProfiles.map((p) => {
      const f = list.find(
        (x) =>
          (x.requester_id === userId && x.addressee_id === p.id) ||
          (x.requester_id === p.id && x.addressee_id === userId)
      );
      if (!f) return { ...p, buttonState: 'add' as const };
      if (f.status === 'accepted') return { ...p, buttonState: 'friends' as const, friendshipId: f.id };
      if (f.requester_id === userId) return { ...p, buttonState: 'pending' as const, friendshipId: f.id };
      return { ...p, buttonState: 'accept' as const, friendshipId: f.id };
    });
  }, [searchProfiles, friendships, userId]);

  const fetchFriendships = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('friendships')
      .select('id, status, requester_id, addressee_id, created_at')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .limit(500);
    if (error) {
      __DEV__ && console.error('Error fetching friendships:', error);
      return;
    }
    setFriendships((data ?? []) as Friendship[]);
  }, [userId]);

  const friends: FriendshipWithProfile[] = React.useMemo(() => {
    return friendsFromContext.map((f) => ({
      id: f.id,
      requester_id: userId ?? '',
      addressee_id: f.id,
      status: 'accepted' as const,
      created_at: '',
      other_user: {
        id: f.id,
        username: f.username,
        display_name: f.display_name,
        avatar_url: f.avatar_url,
        created_at: '',
      },
    }));
  }, [friendsFromContext, userId]);

  useFocusEffect(
    useCallback(() => {
      fetchFriendships();
      refreshFriends();
    }, [fetchFriendships, refreshFriends])
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchText.trim() || !userId) {
      setSearchProfiles([]);
      setSearchLoading(false);
      setSearchResultsVisible(false);
      return;
    }
    setSearchLoading(true);
    setSearchResultsVisible(true);
    debounceRef.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', `%${searchText.trim()}%`)
        .neq('id', userId)
        .limit(20);
      if (error) {
        __DEV__ && console.error('Error searching profiles:', error);
        setSearchProfiles([]);
      } else {
        setSearchProfiles((data ?? []) as Profile[]);
      }
      setSearchLoading(false);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText, userId]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refreshFriends(), fetchFriendships()]);
    setRefreshing(false);
  }

  async function handleAddFriend(addresseeId: string) {
    if (!userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { error } = await supabase.from('friendships').insert({
        requester_id: userId,
        addressee_id: addresseeId,
        status: 'pending',
      });
      if (error) throw error;
      try {
        const ok = await shouldSendNotification(addresseeId, 'friend_request');
        if (ok) {
          await supabase.from('notifications').insert({
            user_id: addresseeId,
            type: 'friend_request',
            from_user_id: userId,
          });
        }
      } catch (notifErr) {
        if (__DEV__) console.error('Friend request notification failed:', notifErr);
      }
      await fetchFriendships();
    } catch (err) {
      if (__DEV__) console.error('Friend request failed:', err);
      Alert.alert('Error', 'Could not send friend request. Please try again.');
    }
  }

  async function handleAccept(friendshipId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId);
      if (error) throw error;
      await Promise.all([fetchFriendships(), refreshFriends()]);
    } catch (err) {
      if (__DEV__) console.error('Accept friend request failed:', err);
      Alert.alert('Error', 'Could not accept friend request. Please try again.');
    }
  }

  function renderSearchResultButton(item: SearchResultWithStatus) {
    if (item.buttonState === 'accept') {
      return (
        <TouchableOpacity
          style={[styles.searchBtn, styles.acceptSearchBtn]}
          activeOpacity={0.8}
          onPress={() => item.friendshipId && handleAccept(item.friendshipId)}
        >
          <Feather name="user-check" size={16} color={theme.colors.textOnPrimary} />
          <Text style={[styles.searchBtnText, styles.searchBtnTextWhite, { marginLeft: 6 }]}>Accept</Text>
        </TouchableOpacity>
      );
    }
    if (item.buttonState === 'add') {
      return (
        <TouchableOpacity
          style={[styles.searchBtn, styles.addSearchBtn]}
          activeOpacity={0.8}
          onPress={() => handleAddFriend(item.id)}
        >
          <Feather name="user-plus" size={16} color={theme.colors.textOnPrimary} />
          <Text style={[styles.searchBtnText, styles.searchBtnTextWhite, { marginLeft: 6 }]}>Add</Text>
        </TouchableOpacity>
      );
    }
    if (item.buttonState === 'pending') {
      return (
        <View style={[styles.searchBtn, styles.pendingBtn]}>
          <Feather name="clock" size={16} color={theme.colors.textTertiary} />
          <Text style={[styles.searchBtnText, { color: theme.colors.textTertiary, marginLeft: 6 }]}>Pending</Text>
        </View>
      );
    }
    return (
      <View style={[styles.searchBtn, styles.friendsBtn]}>
        <Feather name="check" size={16} color={theme.colors.green} />
        <Text style={[styles.searchBtnText, { color: theme.colors.green, marginLeft: 6 }]}>Friends</Text>
      </View>
    );
  }

  if (!userId) return null;

  const bottom = insets.bottom;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <View style={[styles.container, { paddingTop: theme.spacing.md, backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        {friendsLoading ? (
          <View style={styles.listContent}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <View key={i} style={styles.friendSkeletonRow}>
                <Skeleton width={44} height={44} borderRadius={22} />
                <View style={styles.skeletonTextBlock}>
                  <Skeleton width={130} height={14} borderRadius={4} />
                  <Skeleton width={90} height={12} borderRadius={4} style={{ marginTop: 6 }} />
                </View>
              </View>
            ))}
          </View>
        ) : friends.length === 0 ? (
          <View style={styles.emptyCenter}>
            <Feather name="users" size={40} color={theme.colors.textTertiary} />
            <Text style={styles.emptyTitle}>No friends yet</Text>
            <Text style={styles.emptySubtitle}>Search for friends below to get started</Text>
          </View>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: bottom + 140 }]}
            showsVerticalScrollIndicator={false}
            overScrollMode="never"
            bounces={true}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            removeClippedSubviews={true}
            windowSize={5}
            maxToRenderPerBatch={10}
            initialNumToRender={10}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.colors.text}
              />
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.friendRow,
                  pressed && { backgroundColor: theme.colors.surfaceLight },
                ]}
                onPress={() => {
                  (
                    navigation.getParent()?.getParent?.()?.getParent?.() as RootStackNavigationProp | undefined
                  )?.navigate('FriendProfile', {
                    userId: item.other_user?.id ?? '',
                  });
                }}
              >
                <View style={styles.avatarWrap}>
                  <Avatar uri={item.other_user?.avatar_url ?? null} size={40} />
                </View>
                <View style={styles.searchInfo}>
                  <Text style={styles.displayName}>
                    {item.other_user?.display_name || 'No name'}
                  </Text>
                  <Text style={styles.username}>
                    @{item.other_user?.username ?? 'unknown'}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        )}
      </View>

      <View style={[styles.searchSection, { paddingBottom: bottom + 70 }]}>
        {searchResultsVisible && searchText.trim() && (
          <ScrollView style={styles.searchResults} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} overScrollMode="never">
            {searchLoading ? (
              <View style={styles.searchSkeletonList}>
                {[1, 2, 3, 4].map((i) => (
                  <View key={i} style={styles.searchRow}>
                    <View style={styles.avatarWrap}>
                      <Skeleton width={40} height={40} borderRadius={20} />
                    </View>
                    <View style={styles.skeletonTextBlock}>
                      <Skeleton width={140} height={14} borderRadius={7} />
                      <View style={{ marginTop: 6 }}>
                        <Skeleton width={90} height={12} borderRadius={6} />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : searchResults.length === 0 ? (
              <Text style={styles.searchEmpty}>No results found</Text>
            ) : (
              searchResults.map((item) => (
                <View key={item.id} style={styles.searchRow}>
                  <TouchableOpacity
                    style={styles.searchRowTouchable}
                    onPress={() => {
                      (
                        navigation.getParent()?.getParent?.()?.getParent?.() as RootStackNavigationProp | undefined
                      )?.navigate('FriendProfile', {
                        userId: item.id,
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.avatarWrap}>
                      <Avatar uri={item.avatar_url ?? null} size={40} />
                    </View>
                    <View style={styles.searchInfo}>
                      <Text style={styles.displayName}>{item.display_name || 'No name'}</Text>
                      <Text style={styles.username}>@{item.username}</Text>
                    </View>
                  </TouchableOpacity>
                  {renderSearchResultButton(item)}
                </View>
              ))
            )}
          </ScrollView>
        )}
        <View style={styles.searchInputContainer}>
          <Feather name="search" size={18} color={theme.colors.textTertiary} style={styles.searchIcon} />
          <StyledTextInput
            embedded
            style={styles.searchInput}
            placeholder="Add friends by username..."
            value={searchText}
            onChangeText={setSearchText}
            onFocus={() => {
              setSearchFocused(true);
              searchText.trim() && setSearchResultsVisible(true);
            }}
            onBlur={() => setSearchFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>
    </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  emptySubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  friendSkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  skeletonTextBlock: {
    marginLeft: 12,
    flex: 1,
  },
  searchSkeletonList: {
    padding: theme.spacing.md,
  },
  listContent: {
    padding: theme.screenPadding,
    paddingBottom: theme.spacing.lg,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.listRowGap,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  avatarWrap: {
    marginRight: theme.spacing.md,
  },
  searchInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
  },
  username: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  searchSection: {
    paddingHorizontal: theme.screenPadding,
    paddingTop: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  searchResults: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    maxHeight: 300,
  },
  searchEmpty: {
    padding: theme.spacing.lg,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.listRowGap,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  searchRowTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.inputHeight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    minWidth: 80,
    height: theme.button.secondaryHeight,
    borderRadius: 14,
  },
  addSearchBtn: {
    backgroundColor: theme.colors.primary,
  },
  acceptSearchBtn: {
    backgroundColor: theme.colors.green,
  },
  pendingBtn: {
    backgroundColor: theme.colors.surface,
  },
  friendsBtn: {
    backgroundColor: theme.colors.surface,
  },
  searchBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  searchBtnTextWhite: {
    color: theme.colors.textOnPrimary,
  },
});
