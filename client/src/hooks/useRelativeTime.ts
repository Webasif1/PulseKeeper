import { useEffect, useState } from 'react';

import { formatRelativeTime } from '@/utils/format';

/**
 * A relative timestamp that keeps itself current.
 *
 * Without this, "32 seconds ago" stays frozen at 32 seconds until the next
 * poll, which is worse than showing nothing — it quietly misleads. The tick is
 * every 15 seconds because that is the coarsest interval at which the
 * "seconds ago" range still reads as live.
 */
export function useRelativeTime(value: string | Date | undefined | null): string {
  const [label, setLabel] = useState(() => formatRelativeTime(value));

  useEffect(() => {
    setLabel(formatRelativeTime(value));

    const interval = setInterval(() => setLabel(formatRelativeTime(value)), 15_000);
    return () => clearInterval(interval);
  }, [value]);

  return label;
}
