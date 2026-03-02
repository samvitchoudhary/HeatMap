/**
 * categories.ts
 *
 * Fixed set of post categories with display info and heatmap colors.
 * Every post must have a category. 'Misc' is the default.
 */

export type CategoryKey =
  | 'gym'
  | 'food'
  | 'fun'
  | 'study'
  | 'outdoors'
  | 'shopping'
  | 'chill'
  | 'sports'
  | 'misc';

export type Category = {
  key: CategoryKey;
  label: string;
  color: string;
  heatmapColor: string;
};

export const CATEGORIES: Category[] = [
  { key: 'gym', label: 'Gym', color: '#4A4A4A', heatmapColor: 'rgba(74,74,74,0.8)' },
  { key: 'food', label: 'Food', color: '#E6C200', heatmapColor: 'rgba(230,194,0,0.8)' },
  { key: 'fun', label: 'Fun', color: '#AF52DE', heatmapColor: 'rgba(175,82,222,0.8)' },
  { key: 'study', label: 'Study', color: '#1A3A8A', heatmapColor: 'rgba(26,58,138,0.8)' },
  { key: 'outdoors', label: 'Outdoors', color: '#1B6B2E', heatmapColor: 'rgba(27,107,46,0.8)' },
  { key: 'shopping', label: 'Shopping', color: '#E91E8C', heatmapColor: 'rgba(233,30,140,0.8)' },
  { key: 'chill', label: 'Chill', color: '#5AC8FA', heatmapColor: 'rgba(90,200,250,0.8)' },
  { key: 'sports', label: 'Sports', color: '#FF7B00', heatmapColor: 'rgba(255,123,0,0.8)' },
  { key: 'misc', label: 'Misc.', color: '#FF2D55', heatmapColor: 'rgba(255,45,85,0.8)' },
];

export const getCategoryByKey = (key: string | null | undefined): Category | undefined =>
  CATEGORIES.find((c) => c.key === key);

export const DEFAULT_CATEGORY: CategoryKey = 'misc';
