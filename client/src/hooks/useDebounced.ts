import { useEffect, useState } from 'react';

/**
 * Delay a rapidly changing value.
 *
 * Used for the search field: without it, every keystroke would fire a request,
 * and the answers could arrive out of order.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
