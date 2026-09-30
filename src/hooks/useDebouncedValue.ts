import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 * The initial value and empty values pass through immediately, so deep links
 * and clearing a search box never wait on the timer.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  const isEmpty = value === '' || value === null || value === undefined;

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), isEmpty ? 0 : delayMs);
    return () => clearTimeout(timer);
  }, [value, isEmpty, delayMs]);

  return isEmpty ? value : debounced;
}
