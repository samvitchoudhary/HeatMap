/**
 * MapSearchBar.tsx
 *
 * Search bar with Google Places autocomplete dropdown for the map.
 * Extracted from HomeScreen.
 */

import React, { memo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  ActivityIndicator,
  Pressable,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { StyledTextInput } from './StyledTextInput';

export type PlacePrediction = {
  placeId: string;
  name: string;
  description: string;
};

type MapSearchBarProps = {
  searchText: string;
  setSearchText: (value: string) => void;
  searchResults: PlacePrediction[];
  searchLoading: boolean;
  showDropdown: boolean;
  setShowDropdown: (value: boolean) => void;
  onSelectResult: (place: PlacePrediction) => void;
  topOffset: number;
};

export const MapSearchBar = memo(function MapSearchBar({
  searchText,
  setSearchText,
  searchResults,
  searchLoading,
  showDropdown,
  setShowDropdown,
  onSelectResult,
  topOffset,
}: MapSearchBarProps) {
  const dropdownOpacity = useRef(new Animated.Value(0)).current;
  const dropdownTranslateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    if (showDropdown) {
      Animated.parallel([
        Animated.timing(dropdownOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(dropdownTranslateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(dropdownOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(dropdownTranslateY, {
          toValue: -12,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showDropdown, dropdownOpacity, dropdownTranslateY]);

  return (
    <View style={[styles.container, { top: topOffset }]} pointerEvents="box-none">
      <View style={styles.searchBar}>
        <Feather
          name="search"
          size={18}
          color={theme.colors.textTertiary}
          style={styles.searchIcon}
        />
        <StyledTextInput
          embedded
          style={styles.searchInput}
          placeholder="Search a location..."
          value={searchText}
          onChangeText={setSearchText}
          onFocus={() => {
            searchText.trim() && setShowDropdown(true);
          }}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setSearchText('');
              setShowDropdown(false);
              Keyboard.dismiss();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Feather name="x" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {showDropdown && (
        <>
          <Pressable
            style={styles.dropdownBackdrop}
            onPress={() => {
              Keyboard.dismiss();
              setShowDropdown(false);
            }}
          />
          <Animated.View
            style={[
              styles.dropdown,
              {
                opacity: dropdownOpacity,
                transform: [{ translateY: dropdownTranslateY }],
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            {searchLoading ? (
              <View style={styles.dropdownLoading}>
                <ActivityIndicator size="small" color={theme.colors.text} />
              </View>
            ) : searchResults.length === 0 ? (
              <View style={styles.dropdownEmpty}>
                <Text style={styles.dropdownEmptyText}>No results found</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.dropdownScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                overScrollMode="never"
              >
                {searchResults.map((place) => (
                  <TouchableOpacity
                    key={place.placeId}
                    style={styles.dropdownItem}
                    onPress={() => onSelectResult(place)}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name="map-pin"
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                    <View style={styles.dropdownItemText}>
                      <Text style={styles.dropdownItemName}>{place.name}</Text>
                      {place.description && (
                        <Text style={styles.dropdownItemDesc}>
                          {place.description}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </Animated.View>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: theme.screenPadding,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 0,
    borderRadius: theme.borderRadius.full,
    height: theme.inputHeight,
    paddingHorizontal: theme.screenPadding,
    gap: theme.spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  searchIcon: {
    marginRight: theme.spacing.xs,
  },
  searchInput: {
    flex: 1,
    padding: 0,
  },
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  dropdown: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxHeight: 250,
    marginTop: theme.spacing.xs,
    shadowColor: theme.colors.background,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownScroll: {
    maxHeight: 250,
  },
  dropdownLoading: {
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  dropdownEmpty: {
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  dropdownItemText: {
    flex: 1,
  },
  dropdownItemName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  dropdownItemDesc: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  },
});
