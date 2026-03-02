/**
 * timeAgo.ts
 *
 * Shared utility for displaying relative timestamps (e.g., "5m ago", "2h ago").
 * Used across feed cards, comments, and notifications.
 */

/**
 * Converts a timestamp string to a human-readable relative time.
 *
 * @param timestamp - ISO date string or Date-compatible string
 * @returns Relative time string (e.g., "just now", "5m ago", "2h ago", "3d ago")
 */
export function timeAgo(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
