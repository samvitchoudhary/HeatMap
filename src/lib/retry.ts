/**
 * retry.ts
 *
 * Utility for retrying async operations with exponential backoff.
 * Used for critical Supabase calls that should survive transient network failures.
 */

/**
 * Retries an async function up to maxRetries times with exponential backoff.
 *
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 2, so 3 total attempts)
 * @param baseDelay - Initial delay in ms before first retry (default: 500)
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelay: number = 500
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
