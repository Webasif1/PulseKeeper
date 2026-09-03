import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatUptime } from '@/utils/format';

import type { UptimeWindows as UptimeWindowsData } from '@/types/api';

const WINDOWS: Array<{ key: keyof UptimeWindowsData; label: string }> = [
  { key: '24h', label: 'Last 24 hours' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
];

/**
 * Colour by how much slack is left, not by an arbitrary "good" line.
 *
 * 99% sounds healthy and is roughly seven hours of downtime a month, so the
 * thresholds are set where they start to matter rather than where they look
 * reassuring.
 */
function uptimeTone(value: number): string {
  if (value >= 99.9) return 'text-online';
  if (value >= 99) return 'text-slow';
  return 'text-offline';
}

/** Uptime across the four reported windows (SPEC §14). */
export function UptimeWindows({
  uptime,
  isLoading,
}: {
  uptime?: UptimeWindowsData;
  isLoading?: boolean;
}) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {WINDOWS.map((window) => {
        const value = uptime?.[window.key];

        return (
          <div key={window.key}>
            <dt className="text-[11px] tracking-wide text-muted uppercase">{window.label}</dt>
            <dd className="mt-1">
              {isLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <span
                  className={cn(
                    'tabular text-xl font-semibold',
                    // Only an absent value is muted. 0% is a real, and very
                    // bad, reading — it must look like one.
                    value === undefined || value === null
                      ? 'text-[var(--text-muted)]'
                      : uptimeTone(value),
                  )}
                >
                  {value === undefined || value === null ? '—' : formatUptime(value)}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
