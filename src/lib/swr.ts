/**
 * SWR fetcher and configuration utilities
 * Provides consistent caching and request deduplication across the app
 */

// Standard JSON fetcher for SWR
export const fetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error(`Failed to fetch: ${res.status}`);
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  return res.json();
};

// SWR configuration defaults
export const swrConfig = {
  // Don't refetch when window regains focus (data doesn't change that often)
  revalidateOnFocus: false,
  // Don't refetch when reconnecting
  revalidateOnReconnect: false,
  // Cache for 5 minutes before considering stale
  dedupingInterval: 300000,
  // Keep previous data while revalidating
  keepPreviousData: true,
  // Retry failed requests up to 3 times
  errorRetryCount: 3,
};

// Specific configs for different data types
export const comparisonDataConfig = {
  ...swrConfig,
  // Comparison data changes rarely, cache longer
  dedupingInterval: 600000, // 10 minutes
};

export const figureDetailConfig = {
  ...swrConfig,
  // Figure details are stable, cache for 5 minutes
  dedupingInterval: 300000,
};

export const listDataConfig = {
  ...swrConfig,
  // List data is very stable
  dedupingInterval: 600000,
};
