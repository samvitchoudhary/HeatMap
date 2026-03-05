/**
 * LocationSearchModal.tsx
 *
 * Full-screen modal for searching places using Google Places Autocomplete API.
 * Used on the upload screen to let users pick a location for their post.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  SafeAreaView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Constants from 'expo-constants';
import { Feather } from '@expo/vector-icons';
import { theme } from '../lib/theme';

export type PlaceResult = {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectLocation: (place: PlaceResult) => void;
};

const GOOGLE_API_KEY =
  Constants.expoConfig?.ios?.config?.googleMapsApiKey ||
  Constants.expoConfig?.android?.config?.googleMapsApiKey ||
  '';

export const LocationSearchModal: React.FC<Props> = ({
  visible,
  onClose,
  onSelectLocation,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ place_id: string; description: string; structured_formatting?: { main_text: string; secondary_text?: string } }[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${GOOGLE_API_KEY}&types=establishment|geocode`
        );
        const data = await response.json();

        if (data.predictions) {
          setResults(data.predictions);
        } else {
          setResults([]);
        }
      } catch (err) {
        if (__DEV__) console.error('Places search failed:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const handleSelectPlace = async (prediction: (typeof results)[0]) => {
    if (!GOOGLE_API_KEY) {
      if (__DEV__) console.error('Google API key not configured');
      return;
    }
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=geometry,name,formatted_address&key=${GOOGLE_API_KEY}`
      );
      const data = await response.json();

      if (data.result) {
        const place: PlaceResult = {
          placeId: prediction.place_id,
          name:
            data.result.name ||
            prediction.structured_formatting?.main_text ||
            prediction.description,
          address: data.result.formatted_address || prediction.description,
          latitude: data.result.geometry.location.lat,
          longitude: data.result.geometry.location.lng,
        };

        onSelectLocation(place);
        setQuery('');
        setResults([]);
        onClose();
      }
    } catch (err) {
      if (__DEV__) console.error('Place details failed:', err);
    }
  };

  const handleClose = useCallback(() => {
    setQuery('');
    setResults([]);
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="x" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Search Location</Text>
        </View>

        <View style={styles.searchWrap}>
          <View style={styles.searchInputWrap}>
            <Feather name="search" size={16} color={theme.colors.textTertiary} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={handleSearch}
              placeholder="Search for a place..."
              placeholderTextColor={theme.colors.textTertiary}
              style={styles.searchInput}
              autoFocus
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setQuery('');
                  setResults([]);
                }}
              >
                <Feather name="x-circle" size={16} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loading && (
          <ActivityIndicator size="small" color={theme.colors.primary} style={styles.loader} />
        )}

        <FlatList
          data={results}
          keyExtractor={(item) => item.place_id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleSelectPlace(item)}
              style={styles.resultRow}
              activeOpacity={0.7}
            >
              <Feather
                name="map-pin"
                size={16}
                color={theme.colors.textSecondary}
                style={styles.resultIcon}
              />
              <View style={styles.resultTextWrap}>
                <Text style={styles.resultMain} numberOfLines={1}>
                  {item.structured_formatting?.main_text || item.description}
                </Text>
                {item.structured_formatting?.secondary_text ? (
                  <Text style={styles.resultSecondary} numberOfLines={1}>
                    {item.structured_formatting.secondary_text}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            query.length >= 2 && !loading ? (
              <Text style={styles.emptyText}>No results found</Text>
            ) : null
          }
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginLeft: 16,
  },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 12 },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: theme.colors.text,
  },
  loader: { marginTop: 12 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  resultIcon: { marginRight: 12 },
  resultTextWrap: { flex: 1 },
  resultMain: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  resultSecondary: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textTertiary,
    marginTop: 24,
    fontSize: 14,
  },
});
