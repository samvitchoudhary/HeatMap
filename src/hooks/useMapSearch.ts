/**
 * useMapSearch.ts
 *
 * Manages map search: text input, debounced Google Places API calls,
 * results, loading state, dropdown visibility, place selection.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Keyboard } from 'react-native';
import { CONFIG } from '../lib/config';

export type PlacePrediction = {
  placeId: string;
  name: string;
  description: string;
};

export function useMapSearch(googleApiKey: string) {
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<PlacePrediction[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchText.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      setShowDropdown(false);
      return;
    }
    setSearchLoading(true);
    setShowDropdown(true);

    debounceRef.current = setTimeout(async () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const results = await searchPlaces(searchText, googleApiKey, controller.signal);
        if (!controller.signal.aborted) {
          setSearchResults(results);
          setSearchLoading(false);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          setSearchResults([]);
          setSearchLoading(false);
        }
      }
    }, CONFIG.SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText, googleApiKey]);

  const clearSearch = useCallback(() => {
    setSearchText('');
    setSearchResults([]);
    setShowDropdown(false);
    setSearchExpanded(false);
    Keyboard.dismiss();
  }, []);

  const expandSearch = useCallback(() => {
    setSearchExpanded(true);
  }, []);

  const collapseSearch = useCallback(() => {
    setSearchExpanded(false);
    setShowDropdown(false);
    Keyboard.dismiss();
  }, []);

  const selectPlace = useCallback(
    async (place: PlacePrediction): Promise<{ latitude: number; longitude: number } | null> => {
      Keyboard.dismiss();
      setSearchText('');
      setShowDropdown(false);
      setSearchExpanded(false);

      const coords = await getPlaceDetails(place.placeId, googleApiKey);
      return coords;
    },
    [googleApiKey]
  );

  const dismissDropdown = useCallback(() => {
    setShowDropdown(false);
    Keyboard.dismiss();
  }, []);

  return {
    searchText,
    setSearchText,
    searchResults,
    searchLoading,
    showDropdown,
    searchExpanded,
    expandSearch,
    collapseSearch,
    clearSearch,
    selectPlace,
    dismissDropdown,
  };
}

/** Query Google Places Autocomplete API */
async function searchPlaces(
  query: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<PlacePrediction[]> {
  if (!query.trim() || !apiKey) return [];
  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      query
    )}&key=${apiKey}`;
    const response = await fetch(url, { signal });
    if (!response.ok) return [];
    const data = await response.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];

    return ((data.predictions as any[]) || []).map((p) => ({
      placeId: p.place_id ?? '',
      name: p.structured_formatting?.main_text ?? p.description ?? '',
      description: p.structured_formatting?.secondary_text ?? p.description ?? '',
    }));
  } catch (error: any) {
    if (error.name === 'AbortError') throw error;
    return [];
  }
}

/** Get lat/lng for a place ID */
async function getPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<{ latitude: number; longitude: number } | null> {
  if (!apiKey) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status !== 'OK' || !data.result?.geometry?.location) return null;
    return {
      latitude: data.result.geometry.location.lat,
      longitude: data.result.geometry.location.lng,
    };
  } catch {
    return null;
  }
}

