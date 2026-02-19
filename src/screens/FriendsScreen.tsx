import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import type { Profile, Friendship } from '../types';
import { Skeleton } from '../components/Skeleton';
import { Avatar } from '../components/Avatar';

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
  const userId = session?.user?.id;

  const [friends, setFriends] = useState<FriendshipWithProfile[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [requests, setRequests] = useState<FriendshipWithProfile[]>([]);
  const [requestsModalVisible, setRequestsModalVisible] = useState(false);
  const [animatingRequestId, setAnimatingRequestId] = useState<string | null>(null);
  const requestSlideX = useRef(new Animated.Value(0)).current;
  const requestOpacity = useRef(new Animated.Value(1)).current;

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

  const fetchFriends = useCallback(async () => {
    if (!userId) return;
    setFriendsLoading(true);
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

  useEffect(() => {
    fetchFriendships();
  }, [fetchFriendships]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

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
      Alert.alert('Error', error.message);
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
      Alert.alert('Error', error.message);
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
      Alert.alert('Error', error.message);
      return;
    }
    setAnimatingRequestId(friendshipId);
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
          style={[styles.searchBtn, styles.addBtn]}
          onPress={() => item.friendshipId && handleAccept(item.friendshipId)}
          activeOpacity={0.7}
        >
          <Feather name="user-check" size={16} color="#000" />
          <Text style={[styles.searchBtnText, { color: '#000', marginLeft: 6 }]}>Accept</Text>
        </TouchableOpacity>
      );
    }
    if (item.buttonState === 'add') {
      return (
        <TouchableOpacity
          style={[styles.searchBtn, styles.addBtn]}
          onPress={() => handleAddFriend(item.id)}
          activeOpacity={0.7}
        >
          <Feather name="user-plus" size={16} color={theme.colors.background} />
          <Text style={[styles.searchBtnText, { color: theme.colors.background, marginLeft: 6 }]}>Add</Text>
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

  const top = insets.top + (Platform.OS === 'ios' ? 0 : 8);
  const bottom = insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: top, backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.bellButton}
          onPress={() => setRequestsModalVisible(true)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.colors.textSecondary}
              />
            }
            renderItem={({ item }) => (
              <View style={styles.friendRow}>
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
              </View>
            )}
          />
        )}
      </View>

      <View style={[styles.searchSection, { paddingBottom: bottom + theme.spacing.md }]}>
        {searchResultsVisible && searchText.trim() && (
          <ScrollView style={styles.searchResults} keyboardShouldPersistTaps="handled">
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
        <View style={styles.searchInputContainer}>
          <Feather name="search" size={18} color={theme.colors.textTertiary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Add friends by username..."
            placeholderTextColor={theme.colors.textTertiary}
            value={searchText}
            onChangeText={setSearchText}
            onFocus={() => searchText.trim() && setSearchResultsVisible(true)}
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
                            style={[styles.searchBtn, styles.acceptBtn]}
                            onPress={() => handleAccept(item.id)}
                            activeOpacity={0.7}
                            disabled={!!animatingRequestId}
                          >
                            <Feather name="check" size={16} color={theme.colors.background} />
                            <Text style={[styles.searchBtnText, { color: theme.colors.background, marginLeft: 6 }]}>Accept</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.searchBtn, styles.declineBtn]}
                            onPress={() => handleDecline(item.id)}
                            activeOpacity={0.7}
                            disabled={!!animatingRequestId}
                          >
                            <Feather name="x" size={16} color={theme.colors.textSecondary} />
                            <Text style={[styles.searchBtnText, { color: theme.colors.textSecondary, marginLeft: 6 }]}>Decline</Text>
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
    paddingHorizontal: theme.spacing.md,
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
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  title: {
    fontSize: theme.fontSize.lg,
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
    fontSize: theme.fontSize.lg,
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
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
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
    fontWeight: '700',
    color: theme.colors.text,
  },
  username: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  searchSection: {
    paddingHorizontal: theme.spacing.md,
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
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    minWidth: 80,
  },
  addBtn: {
    backgroundColor: '#FFFFFF',
  },
  acceptBtn: {
    backgroundColor: '#FFFFFF',
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
    fontSize: theme.fontSize.sm,
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
    fontSize: theme.fontSize.lg,
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
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});
