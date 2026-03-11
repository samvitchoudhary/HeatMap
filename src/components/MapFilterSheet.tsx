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
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.surface,
        borderRadius: 10,
        padding: 2,
      }}
    >
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.key}
          onPress={() => onSelect(opt.key)}
          style={{
            flex: 1,
            paddingVertical: 7,
            borderRadius: 8,
            alignItems: 'center',
            backgroundColor:
              selected === opt.key ? theme.colors.background : 'transparent',
            shadowColor: selected === opt.key ? '#000' : 'transparent',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: selected === opt.key ? 0.1 : 0,
            shadowRadius: 2,
            elevation: selected === opt.key ? 2 : 0,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: selected === opt.key ? '600' : '400',
              color:
                selected === opt.key
                  ? theme.colors.text
                  : theme.colors.textSecondary,
            }}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
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
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 8,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: theme.colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {title}
      </Text>
      {count != null && (
        <Text
          style={{
            fontSize: 11,
            color: theme.colors.textTertiary,
          }}
        >
          {count}
        </Text>
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
    { key: 'mine', label: 'Me' },
    { key: 'friends', label: 'Friends' },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
        onPress={onClose}
      >
        <View style={{ flex: 1 }} />
        <Pressable onPress={(e) => e.stopPropagation()}>
          <SafeAreaView
            style={{
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 8,
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: 4 }}>
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: theme.colors.border,
                }}
              />
            </View>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: '700',
                  color: theme.colors.text,
                }}
              >
                Filters
              </Text>
              <TouchableOpacity onPress={handleReset} disabled={isDefault}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: isDefault
                      ? theme.colors.textTertiary
                      : theme.colors.primary,
                  }}
                >
                  Reset
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 20 }}>
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
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {CATEGORIES.map((cat) => {
                  const isSelected = categories.has(cat.key);
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      onPress={() => toggleCategory(cat.key)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 16,
                        backgroundColor: isSelected
                          ? cat.color + '18'
                          : theme.colors.surface,
                      }}
                    >
                      {isSelected && (
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: cat.color,
                            marginRight: 5,
                          }}
                        />
                      )}
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: isSelected ? '600' : '400',
                          color: isSelected
                            ? cat.color
                            : theme.colors.textTertiary,
                        }}
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

            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 8,
              }}
            >
              <TouchableOpacity
                onPress={handleApply}
                style={{
                  backgroundColor: theme.colors.primary,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '700',
                    color: '#FFFFFF',
                  }}
                >
                  Apply
                </Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
