/**
 * MapFilterSheet.tsx
 *
 * Bottom sheet for filtering map posts by time range, category, and owner.
 * Clean, compact iOS-native design.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import { theme } from '../lib/theme';
import { CATEGORIES, type CategoryKey } from '../lib/categories';

const SegmentedControl = React.memo(
  ({
    options,
    selected,
    onSelect,
  }: {
    options: { key: string; label: string }[];
    selected: string;
    onSelect: (key: string) => void;
  }) => (
    <View style={styles.segmentContainer}>
      {options.map((opt) => {
        const isActive = selected === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => onSelect(opt.key)}
            style={[styles.segmentOption, isActive && styles.segmentOptionActive]}
          >
            <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  )
);

SegmentedControl.displayName = 'SegmentedControl';

function SectionHeader({
  title,
  count,
}: {
  title: string;
  count?: string;
}) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
      {count != null && (
        <Text style={styles.sectionHeaderCount}>{count}</Text>
      )}
    </View>
  );
}

export type MapFilters = {
  timeRange: 'today' | 'week' | 'month' | 'year' | 'all';
  categories: Set<CategoryKey>;
  owner: 'all' | 'me' | 'friends';
};

export const DEFAULT_FILTERS: MapFilters = {
  timeRange: 'all',
  categories: new Set(CATEGORIES.map((c) => c.key)),
  owner: 'all',
};

export function filtersAreDefault(filters: MapFilters): boolean {
  return (
    filters.timeRange === 'all' &&
    filters.categories.size === CATEGORIES.length &&
    filters.owner === 'all'
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  currentFilters: MapFilters;
  onApply: (filters: MapFilters) => void;
};

export const MapFilterSheet: React.FC<Props> = ({
  visible,
  onClose,
  currentFilters,
  onApply,
}) => {
  const [timeRange, setTimeRange] = useState(currentFilters.timeRange);
  const [categories, setCategories] = useState(new Set(currentFilters.categories));
  const [owner, setOwner] = useState(currentFilters.owner);

  React.useEffect(() => {
    if (visible) {
      setTimeRange(currentFilters.timeRange);
      setCategories(new Set(currentFilters.categories));
      setOwner(currentFilters.owner);
    }
  }, [visible, currentFilters]);

  const toggleCategory = (key: CategoryKey) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleApply = () => {
    onApply({ timeRange, categories, owner });
    onClose();
  };

  const handleReset = () => {
    setTimeRange('all');
    setCategories(new Set(CATEGORIES.map((c) => c.key)));
    setOwner('all');
  };

  const isDefault =
    timeRange === 'all' &&
    categories.size === CATEGORIES.length &&
    owner === 'all';

  const timeOptions: { key: MapFilters['timeRange']; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
    { key: 'all', label: 'All' },
  ];

  const ownerOptions: { key: MapFilters['owner']; label: string }[] = [
    { key: 'all', label: 'Everyone' },
    { key: 'me', label: 'Me' },
    { key: 'friends', label: 'Friends' },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.overlaySpacer} />
        <Pressable onPress={(e) => e.stopPropagation()}>
          <SafeAreaView style={styles.sheet}>
            <View style={styles.handleWrapper}>
              <View style={styles.handle} />
            </View>

            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>Filters</Text>
              <TouchableOpacity onPress={handleReset} disabled={isDefault}>
                <Text
                  style={[
                    styles.resetText,
                    isDefault && styles.resetTextDisabled,
                  ]}
                >
                  Reset
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              <SectionHeader title="Time Range" />
              <SegmentedControl
                options={timeOptions}
                selected={timeRange}
                onSelect={(key) =>
                  setTimeRange(key as MapFilters['timeRange'])
                }
              />

              <SectionHeader
                title="Categories"
                count={`${categories.size}/${CATEGORIES.length}`}
              />
              <View style={styles.chipRow}>
                {CATEGORIES.map((cat) => {
                  const isSelected = categories.has(cat.key);
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      onPress={() => toggleCategory(cat.key)}
                      style={[
                        styles.chip,
                        { backgroundColor: isSelected ? cat.color + '18' : theme.colors.surface },
                      ]}
                    >
                      {isSelected && (
                        <View style={[styles.chipDot, { backgroundColor: cat.color }]} />
                      )}
                      <Text
                        style={[
                          styles.chipText,
                          isSelected && { fontWeight: '600', color: cat.color },
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <SectionHeader title="Show Posts From" />
              <SegmentedControl
                options={ownerOptions}
                selected={owner}
                onSelect={(key) => setOwner(key as MapFilters['owner'])}
              />
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                onPress={handleApply}
                style={styles.applyButton}
                activeOpacity={0.8}
              >
                <Text style={styles.applyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  overlaySpacer: {
    flex: 1,
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
  },
  handleWrapper: {
    alignItems: 'center',
    marginBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
  },
  resetText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  resetTextDisabled: {
    color: theme.colors.textTertiary,
  },
  content: {
    paddingHorizontal: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeaderCount: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: 2,
  },
  segmentOption: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  segmentOptionActive: {
    backgroundColor: theme.colors.background,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  },
  segmentTextActive: {
    fontWeight: '600',
    color: theme.colors.text,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.textTertiary,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  applyButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  applyText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
