import { useState } from 'react';

import { cn } from '@/lib/cn';
import { formatDateTime, formatResponseTime } from '@/utils/format';

import type { TimelineEntry } from '@/types/api';

/**
 * The health timeline (SPEC §15).
 *
 * One segment per check, oldest to newest. Deliberately not a Recharts view:
 * this is a strip of discrete outcomes rather than a continuous series, and
 * plain elements give better control over hit areas and keyboard access than a
 * chart library would.
 */
export function HealthTimeline({
  entries,
  slowThresholdMs,
  isLoading,
}: {
  entries: TimelineEntry[];
  slowThresholdMs: number;
  isLoading?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);

  if (isLoading) {
    return <div className="h-10 animate-pulse rounded-md bg-[var(--surface-inset)]" />;
  }

  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        No checks recorded yet. Segments appear here as checks run.
      </p>
    );
  }

  const segmentColour = (entry: TimelineEntry): string => {
    if (!entry.success) return 'bg-offline';
    if (entry.responseTimeMs !== undefined && entry.responseTimeMs > slowThresholdMs) {
      return 'bg-slow';
    }
    return 'bg-online';
  };

  const describe = (entry: TimelineEntry): string => {
    if (!entry.success) return entry.errorType ? `Failed — ${entry.errorType}` : 'Failed';
    if (entry.responseTimeMs !== undefined && entry.responseTimeMs > slowThresholdMs) {
      return 'Slow';
    }
    return 'Online';
  };

  const activeEntry = active === null ? null : entries[active];

  return (
    <div>
      <div
        className="flex h-10 items-stretch gap-0.5"
        role="img"
        aria-label={`Health timeline of the last ${entries.length} checks, oldest first`}
      >
        {entries.map((entry, index) => (
          <button
            key={`${entry.checkedAt}-${index}`}
            type="button"
            // Focusable as well as hoverable: a mouse-only timeline hides its
            // detail from anyone navigating by keyboard.
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            aria-label={`${formatDateTime(entry.checkedAt)}: ${describe(entry)}`}
            className={cn(
              'min-w-1 flex-1 rounded-[2px] transition-opacity',
              segmentColour(entry),
              active !== null && active !== index ? 'opacity-40' : 'opacity-100',
            )}
          />
        ))}
      </div>

      <div className="mt-3 flex min-h-9 items-start justify-between gap-4 text-xs">
        {activeEntry ? (
          // The detail panel is a fixed slot rather than a floating tooltip, so
          // reading across segments does not make the layout jump.
          <dl className="flex flex-wrap gap-x-5 gap-y-1">
            <div className="flex gap-1.5">
              <dt className="text-muted">Time</dt>
              <dd className="tabular font-medium">{formatDateTime(activeEntry.checkedAt)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted">Status</dt>
              <dd className="font-medium">{describe(activeEntry)}</dd>
            </div>
            {activeEntry.responseTimeMs !== undefined && (
              <div className="flex gap-1.5">
                <dt className="text-muted">Response</dt>
                <dd className="tabular font-medium">
                  {formatResponseTime(activeEntry.responseTimeMs)}
                </dd>
              </div>
            )}
            {activeEntry.statusCode !== undefined && (
              <div className="flex gap-1.5">
                <dt className="text-muted">HTTP</dt>
                <dd className="tabular font-medium">{activeEntry.statusCode}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-muted">Hover or focus a segment for details.</p>
        )}

        <div className="flex shrink-0 gap-3 text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-online" aria-hidden="true" />
            Online
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slow" aria-hidden="true" />
            Slow
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-offline" aria-hidden="true" />
            Failed
          </span>
        </div>
      </div>
    </div>
  );
}
