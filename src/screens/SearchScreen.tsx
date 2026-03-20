/**
 * SearchScreen.tsx
 *
 * Dedicated search tab for finding users.
 * Shows recent searches (stored in Supabase profiles.recent_searches).
 * Tapping a result navigates to that user's profile.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { searchProfilesByName } from '../services/friendships.service';
import { CONFIG } from '../lib/config';
import { Avatar } from '../components/Avatar';
import type { RootStackNavigationProp, SearchStackParamList } from '../navigation/types';

type SearchResult = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

const MAX_RECENT_SEARCHES = 15;

type SearchNav = NativeStackNavigationProp<SearchStackParamList, 'SearchMain'>;

export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<SearchNav>();
  const { profile } = useAuth();
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);
  const [loadingRecents, setLoadingRecents] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const loadRecentSearches = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data } = await supabase.from('profiles').select('recent_searches').eq('id', profile.id).single();

      if (data?.recent_searches && Array.isArray(data.recent_searches)) {
        setRecentSearches(data.recent_searches as SearchResult[]);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingRecents(false);
    }
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      loadRecentSearches();
    }, [loadRecentSearches])
  );

  const saveRecentSearches = useCallback(
    async (searches: SearchResult[]) => {
      if (!profile?.id) return;
      try {
        await supabase.from('profiles').update({ recent_searches: searches }).eq('id', profile.id);
      } catch {
        /* ignore */
      }
    },
    [profile?.id]
  );

  const addToRecentSearches = useCallback(
    (user: SearchResult) => {
      setRecentSearches((prev) => {
        const filtered = prev.filter((s) => s.id !== user.id);
        const updated = [user, ...filtered].slice(0, MAX_RECENT_SEARCHES);
        void saveRecentSearches(updated);
        return updated;
      });
    },
    [saveRecentSearches]
  );

  const removeRecentSearch = useCallback(
    (userId: string) => {
      setRecentSearches((prev) => {
        const updated = prev.filter((s) => s.id !== userId);
        void saveRecentSearches(updated);
        return updated;
      });
    },
    [saveRecentSearches]
  );

  const clearAllRecentSearches = useCallback(() => {
    setRecentSearches([]);
    void saveRecentSearches([]);
  }, [saveRecentSearches]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!searchText.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data, error } = await searchProfilesByName(searchText.trim(), profile?.id ?? '', 20);
        if (!error && data) {
          setResults(data as SearchResult[]);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, CONFIG.SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText, profile?.id]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSelectUser = useCallback(
    (user: SearchResult) => {
      Keyboard.dismiss();
      addToRecentSearches(user);
      const tabNav = navigation.getParent();
      const rootNav = tabNav?.getParent() as RootStackNavigationProp | undefined;
      if (user.id === profile?.id) {
        tabNav?.navigate('Profile');
      } else {
        rootNav?.navigate('FriendProfile', { userId: user.id });
      }
    },
    [navigation, profile?.id, addToRecentSearches]
  );

  const isSearching = searchText.trim().length > 0;

  const renderUserRow = useCallback(
    ({ item, isRecent }: { item: SearchResult; isRecent?: boolean }) => (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() => handleSelectUser(item)}
        activeOpacity={0.6}
        accessibilityLabel={`${item.display_name}, @${item.username}`}
        accessibilityRole="button"
      >
        <Avatar uri={item.avatar_url} size={44} />
        <View style={styles.userInfo}>
          <Text style={styles.username}>@{item.username}</Text>
          <Text style={styles.displayName}>{item.display_name}</Text>
        </View>
        {isRecent && (
          <TouchableOpacity
            onPress={() => removeRecentSearch(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.removeButton}
            accessibilityLabel="Remove from recent searches"
            accessibilityRole="button"
          >
            <Feather name="x" size={16} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    ),
    [handleSelectUser, removeRecentSearch]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.searchBarContainer}>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color={theme.colors.textTertiary} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search users"
            placeholderTextColor={theme.colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchText('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
            >
              <Feather name="x-circle" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isSearching ? (
        <>
          {loading && results.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : results.length === 0 && !loading ? (
            <View style={styles.centered}>
              <Feather name="user-x" size={32} color={theme.colors.textTertiary} />
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => renderUserRow({ item, isRecent: false })}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={true}
            />
          )}
        </>
      ) : (
        <>
          {recentSearches.length > 0 ? (
            <>
              <View style={styles.recentHeader}>
                <Text style={styles.recentTitle}>Recent</Text>
                <TouchableOpacity onPress={clearAllRecentSearches} accessibilityRole="button" accessibilityLabel="Clear all recent searches">
                  <Text style={styles.clearAll}>Clear all</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={recentSearches}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => renderUserRow({ item, isRecent: true })}
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews={true}
              />
            </>
          ) : !loadingRecents ? (
            <View style={styles.centered}>
              <Feather name="search" size={32} color={theme.colors.textTertiary} />
              <Text style={styles.emptyText}>Search for users</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    padding: 0,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  displayName: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  removeButton: {
    padding: 4,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  recentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  clearAll: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
});
