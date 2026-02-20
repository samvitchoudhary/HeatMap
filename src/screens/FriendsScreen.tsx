import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  FlatList,
  Modal,
  Platform,
  Alert,
  ScrollView,
  RefreshControl,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { supabase } from '../lib/supabase';
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

const DEBOUNCE_MS = 500;

export function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { showToast } = useToast();
  const userId = session?.user?.id;

  const [friends, setFriends] = useState<FriendshipWithProfile[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [requests, setRequests] = useState<FriendshipWithProfile[]>([]);
  const [requestsModalVisible, setRequestsModalVisible] = useState(false);
  const [animatingRequestId, setAnimatingRequestId] = useState<string | null>(null);
  const requestSlideX = useRef(new Animated.Value(0)).current;
  const requestOpacity = useRef(new Animated.Value(1)).current;

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
      .select('*')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (error) {
      console.error('Error fetching friendships:', error);
      return;
    }
    setFriendships((data ?? []) as Friendship[]);
  }, [userId]);

  const fetchFriends = useCallback(async (showLoading = true) => {
    if (!userId) return;
    if (showLoading) setFriendsLoading(true);
    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (error) {
      console.error('Error fetching friends:', error);
      setFriendsLoading(false);
      return;
    }
    const rows = (data ?? []) as Friendship[];
    const otherIds = rows.map((r) =>
      r.requester_id === userId ? r.addressee_id : r.requester_id
    );
    if (otherIds.length === 0) {
      setFriends([]);
      setFriendsLoading(false);
      return;
    }
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', otherIds);
    const profileMap = new Map(
      ((profiles ?? []) as Profile[]).map((p) => [p.id, p])
    );
    setFriends(
      rows.map((r) => ({
        ...r,
        other_user:
          profileMap.get(r.requester_id === userId ? r.addressee_id : r.requester_id)!,
      }))
    );
    setFriendsLoading(false);
  }, [userId]);

  const fetchRequests = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .eq('addressee_id', userId)
      .eq('status', 'pending');
    if (error) {
      console.error('Error fetching requests:', error);
      return;
    }
    const rows = (data ?? []) as Friendship[];
    const ids = rows.map((r) => r.requester_id);
    if (ids.length === 0) {
      setRequests([]);
      return;
    }
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', ids);
    const profileMap = new Map(
      ((profiles ?? []) as Profile[]).map((p) => [p.id, p])
    );
    setRequests(
      rows.map((r) => ({
        ...r,
        other_user: profileMap.get(r.requester_id)!,
      }))
    );
  }, [userId]);

  const hasInitiallyFetched = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const isInitial = !hasInitiallyFetched.current;
      hasInitiallyFetched.current = true;
      fetchFriendships();
      fetchRequests();
      if (isInitial) {
        fetchFriends();
      } else {
        fetchFriends(false);
      }
    }, [fetchFriendships, fetchRequests, fetchFriends])
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
        .select('*')
        .ilike('username', `%${searchText.trim()}%`)
        .neq('id', userId)
        .limit(10);
      if (error) {
        console.error('Error searching profiles:', error);
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
    await Promise.all([fetchFriends(), fetchRequests(), fetchFriendships()]);
    setRefreshing(false);
  }

  async function handleAddFriend(addresseeId: string) {
    if (!userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await supabase.from('friendships').insert({
      requester_id: userId,
      addressee_id: addresseeId,
      status: 'pending',
    });
    if (error) {
      showToast(error.message);
      return;
    }
    await fetchFriendships();
  }

  async function handleAccept(friendshipId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);
    if (error) {
      showToast(error.message);
      return;
    }
    setAnimatingRequestId(friendshipId);
  }

  async function handleDecline(friendshipId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'declined' })
      .eq('id', friendshipId);
    if (error) {
      showToast(error.message);
      return;
    }
    setAnimatingRequestId(friendshipId);
  }

  function handleLongPressFriend(item: FriendshipWithProfile) {
    const username = item.other_user?.username ?? 'unknown';
    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove @${username} as a friend?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeFriend(item.id),
        },
      ]
    );
  }

  async function removeFriend(friendshipId: string) {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);
    if (error) {
      console.log('Remove friend failed:', error);
      showToast(error.message);
      return;
    }
    setFriends((prev) => prev.filter((f) => f.id !== friendshipId));
    setFriendships((prev) => prev.filter((f) => f.id !== friendshipId));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  useEffect(() => {
    if (!animatingRequestId) return;
    requestSlideX.setValue(0);
    requestOpacity.setValue(1);
    Animated.parallel([
      Animated.timing(requestSlideX, { toValue: -400, duration: 250, useNativeDriver: true }),
      Animated.timing(requestOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      setRequests((prev) => prev.filter((r) => r.id !== animatingRequestId));
      setAnimatingRequestId(null);
      fetchFriendships();
      fetchFriends();
    });
  }, [animatingRequestId, requestSlideX, requestOpacity]);

  function renderSearchResultButton(item: SearchResultWithStatus) {
    if (item.buttonState === 'accept') {
      return (
        <TouchableOpacity
          style={[styles.searchBtn, styles.primarySearchBtn]}
          activeOpacity={0.8}
          onPress={() => item.friendshipId && handleAccept(item.friendshipId)}
        >
          <Feather name="user-check" size={16} color={theme.colors.textOnLight} />
          <Text style={[styles.searchBtnText, { color: theme.colors.textOnLight, marginLeft: 6 }]}>Accept</Text>
        </TouchableOpacity>
      );
    }
    if (item.buttonState === 'add') {
      return (
        <TouchableOpacity
          style={[styles.searchBtn, styles.primarySearchBtn]}
          activeOpacity={0.8}
          onPress={() => handleAddFriend(item.id)}
        >
          <Feather name="user-plus" size={16} color={theme.colors.textOnLight} />
          <Text style={[styles.searchBtnText, { color: theme.colors.textOnLight, marginLeft: 6 }]}>Add</Text>
        </TouchableOpacity>
      );
    }
    if (item.buttonState === 'pending') {
      return (
        <View style={[styles.searchBtn, styles.pendingBtn]}>
          <Feather name="clock" size={16} color={theme.colors.textSecondary} />
          <Text style={[styles.searchBtnText, { color: theme.colors.textSecondary, marginLeft: 6 }]}>Pending</Text>
        </View>
      );
    }
    return (
      <View style={[styles.searchBtn, styles.friendsBtn]}>
        <Feather name="check" size={16} color={theme.colors.textSecondary} />
        <Text style={[styles.searchBtnText, { color: theme.colors.textSecondary, marginLeft: 6 }]}>Friends</Text>
      </View>
    );
  }

  if (!userId) return null;

  const top = insets.top + 16;
  const bottom = insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: top, backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.bellButton}
          onPress={() => setRequestsModalVisible(true)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Feather name="bell" size={24} color={theme.colors.text} />
          {requests.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {requests.length > 99 ? '99+' : requests.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.title}>Friends</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        {friendsLoading ? (
          <View style={styles.listContent}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.friendRow}>
                <View style={styles.avatarWrap}>
                  <Skeleton width={40} height={40} borderRadius={20} />
                </View>
                <View style={styles.skeletonTextBlock}>
                  <Skeleton width={160} height={16} borderRadius={8} />
                  <View style={{ marginTop: 8 }}>
                    <Skeleton width={100} height={12} borderRadius={6} />
                  </View>
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
                onLongPress={() => handleLongPressFriend(item)}
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
                  <View style={styles.avatarWrap}>
                    <Avatar uri={item.avatar_url ?? null} size={40} />
                  </View>
                  <View style={styles.searchInfo}>
                    <Text style={styles.displayName}>{item.display_name || 'No name'}</Text>
                    <Text style={styles.username}>@{item.username}</Text>
                  </View>
                  {renderSearchResultButton(item)}
                </View>
              ))
            )}
          </ScrollView>
        )}
        <View
          style={[
            styles.searchInputContainer,
            { borderColor: searchFocused ? theme.colors.textSecondary : theme.colors.border },
          ]}
        >
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

      <Modal
        visible={requestsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRequestsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setRequestsModalVisible(false)}
          />
          <View style={styles.requestsSheet}>
                <View style={styles.requestsHeader}>
                  <Text style={styles.requestsTitle}>Friend Requests</Text>
                  <TouchableOpacity
                    onPress={() => setRequestsModalVisible(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    activeOpacity={0.7}
                  >
                    <Feather name="x" size={24} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>
                {requests.length === 0 ? (
                  <Text style={styles.requestsEmpty}>No pending requests</Text>
                ) : (
                  requests.map((item) => {
                    const isAnimating = animatingRequestId === item.id;
                    const RowWrapper = isAnimating ? Animated.View : View;
                    const rowStyle = isAnimating
                      ? [styles.requestRow, { transform: [{ translateX: requestSlideX }], opacity: requestOpacity }]
                      : styles.requestRow;
                    return (
                      <RowWrapper key={item.id} style={rowStyle}>
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
                        <View style={styles.requestActions}>
                          <TouchableOpacity
                            style={[styles.searchBtn, styles.primarySearchBtn]}
                            onPress={() => handleAccept(item.id)}
                            activeOpacity={0.8}
                            disabled={!!animatingRequestId}
                          >
                            <Feather name="check" size={16} color={theme.colors.textOnLight} />
                            <Text style={[styles.searchBtnText, { color: theme.colors.textOnLight, marginLeft: 6 }]}>Accept</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.searchBtn, styles.secondarySearchBtn]}
                            onPress={() => handleDecline(item.id)}
                            activeOpacity={0.8}
                            disabled={!!animatingRequestId}
                          >
                            <Feather name="x" size={16} color={theme.colors.text} />
                            <Text style={[styles.searchBtnText, { color: theme.colors.text, marginLeft: 6 }]}>Decline</Text>
                          </TouchableOpacity>
                        </View>
                      </RowWrapper>
                    );
                  })
                )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.screenPadding,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  bellButton: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.red,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.light,
  },
  title: {
    fontSize: theme.fontSize.title,
    fontWeight: '700',
    color: theme.colors.text,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: theme.fontSize.title,
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
  skeletonTextBlock: {
    marginLeft: theme.spacing.md,
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
    borderBottomColor: theme.colors.border,
  },
  avatarWrap: {
    marginRight: theme.spacing.md,
  },
  searchInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
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
    borderTopColor: theme.colors.border,
  },
  searchResults: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    maxHeight: 300,
  },
  searchLoader: {
    padding: theme.spacing.lg,
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
    borderBottomColor: theme.colors.border,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.inputHeight,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
  },
  primarySearchBtn: {
    backgroundColor: theme.colors.light,
    height: theme.button.secondaryHeight,
    borderRadius: theme.button.borderRadius,
  },
  secondarySearchBtn: {
    backgroundColor: theme.colors.surface,
    height: theme.button.secondaryHeight,
    borderRadius: theme.button.borderRadius,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pendingBtn: {
    backgroundColor: theme.colors.surfaceLight,
  },
  friendsBtn: {
    backgroundColor: theme.colors.surfaceLight,
  },
  declineBtn: {
    backgroundColor: 'transparent',
  },
  searchBtnText: {
    fontSize: theme.fontSize.button,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  requestsSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    paddingBottom: 48,
    maxHeight: '70%',
  },
  requestsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  requestsTitle: {
    fontSize: theme.fontSize.title,
    fontWeight: '700',
    color: theme.colors.text,
  },
  requestsEmpty: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.listRowGap,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});
