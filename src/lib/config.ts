/**
 * config.ts
 *
 * Centralized app configuration constants.
 * Change values here instead of hunting through individual files.
 */

/** Basic email format check — catches obvious mistakes (no @, no dot) */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

export const CONFIG = {
  // Pagination
  POSTS_PAGE_SIZE: 50,
  FEED_PAGE_SIZE: 20,
  PROFILE_PAGE_SIZE: 30,
  COMMENTS_PAGE_SIZE: 30,
  NOTIFICATIONS_PAGE_SIZE: 30,
  FRIENDS_LIMIT: 500,

  // Map
  MAP_DEFAULT_REGION: {
    latitude: 38.9869,
    longitude: -76.9426,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  },
  MAP_REGION_DEBOUNCE_MS: 150,
  MAP_TAP_RADIUS_FACTOR: 0.05,
  MAP_OFFSET_FACTOR: 0.008,

  // Throttle
  POSTS_THROTTLE_MS: 15000,
  FRIENDS_THROTTLE_MS: 10000,

  // Notifications
  NOTIFICATION_PREF_CACHE_TTL_MS: 60000,

  // Images
  IMAGE_COMPRESS_WIDTH: 1080,
  IMAGE_COMPRESS_QUALITY: 0.7,

  // Search
  SEARCH_DEBOUNCE_MS: 300,

  // Passwords
  MIN_PASSWORD_LENGTH: 8,

  // Feed
  FEED_SCORE_RECENCY_HOURS: 48,
  FEED_SCORE_ENGAGEMENT_CAP: 0.5,
  FEED_SCORE_ENGAGEMENT_FACTOR: 0.1,
} as const;
