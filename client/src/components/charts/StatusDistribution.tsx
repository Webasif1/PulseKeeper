import { cn } from '@/lib/cn';
import { formatNumber } from '@/utils/format';

import type { StatusDistributionEntry } from '@/types/api';

/**
 * HTTP status distribution (SPEC §12).
 *
 * Horizontal bars rather than a pie chart: comparing lengths is far easier than
 * comparing angles, and a distribution dominated by one value — which is the
 * normal case for a healthy site — leaves a pie with unreadable slivers.
 */
export function StatusDistribution({
  entries,
  isLoading,
}: {
  entries: StatusDistributionEntry[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-6 animate-pulse rounded bg-[var(--surface-inset)]" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No checks in this period yet.</p>;
  }

  const total = entries.reduce((sum, entry) => sum + entry.count, 0);

  const toneFor = (statusCode: number | null): string => {
    // A missing status code means the request never got a reply at all — a
    // timeout or a DNS failure — which is a worse outcome than any 5xx.
    if (statusCode === null) return 'bg-offline';
    if (statusCode >= 500) return 'bg-offline';
    if (statusCode >= 400) return 'bg-slow';
    if (statusCode >= 300) return 'bg-brand-400';
    return 'bg-online';
  };

  const labelFor = (statusCode: number | null): string =>
    statusCode === null ? 'No response' : `HTTP ${statusCode}`;

  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const share = total > 0 ? (entry.count / total) * 100 : 0;

        return (
          <li key={entry.statusCode ?? 'none'}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium">{labelFor(entry.statusCode)}</span>
              <span className="tabular text-muted">
                {formatNumber(entry.count)} ({share.toFixed(1)}%)
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-inset)]">
              <div
                className={cn('h-full rounded-full', toneFor(entry.statusCode))}
                // Sub-pixel bars vanish; a floor keeps a rare status visible.
                style={{ width: `${Math.max(share, 1.5)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
