import { ScrollText } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePolling } from '@/hooks/usePolling';
import { cn } from '@/lib/cn';
import { ApiError } from '@/services/api';
import * as monitorRunService from '@/services/monitorRun.service';
import { formatDateTime, formatNumber } from '@/utils/format';

import type { MonitorRun } from '@/types/api';

const POLL_INTERVAL_MS = 60_000;

const TRIGGER_LABELS: Record<string, string> = {
  CRON: 'Scheduled',
  MANUAL: 'Manual',
  EXTERNAL: 'External cron',
  SEED: 'Seed',
};

/**
 * The monitoring log (SPEC §40).
 *
 * Instance telemetry rather than user data: each row holds counters only —
 * never site names, URLs, or ids — which is why it is visible to any signed-in
 * user without leaking anything about another account's websites.
 */
export function MonitorLogPage() {
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await monitorRunService.listMonitorRuns({ limit: 50 });
      setRuns(result.items);
      setTotal(result.pagination.total);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the monitoring log');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(load, POLL_INTERVAL_MS);

  return (
    <AppShell
      title="Monitoring log"
      description="Every sweep the monitor has run, and what it found"
    >
      {isLoading ? (
        <div className="space-y-3">
          <span className="sr-only" role="status">
            Loading the monitoring log
          </span>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={() => void load()} />
        </Card>
      ) : runs.length === 0 ? (
        <Card>
          <EmptyState
            icon={ScrollText}
            title="No sweeps recorded yet"
            description="A row appears here each time the monitor checks at least one website. Idle ticks are not recorded."
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            {/* The table scrolls inside its own container so the page itself
                never scrolls sideways on a narrow screen. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-left">
                    <th scope="col" className="px-4 py-3 text-xs font-medium tracking-wide text-muted uppercase">
                      Started
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium tracking-wide text-muted uppercase">
                      Trigger
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium tracking-wide text-muted uppercase">
                      Checked
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium tracking-wide text-muted uppercase">
                      Online
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium tracking-wide text-muted uppercase">
                      Slow
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium tracking-wide text-muted uppercase">
                      Offline
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium tracking-wide text-muted uppercase">
                      Errors
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium tracking-wide text-muted uppercase">
                      Took
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {runs.map((run) => (
                    <tr key={run.id} className="transition-colors hover:bg-[var(--surface-hover)]">
                      <td className="tabular px-4 py-3 whitespace-nowrap">
                        {formatDateTime(run.startedAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {TRIGGER_LABELS[run.trigger] ?? run.trigger}
                      </td>
                      <td className="tabular px-4 py-3 text-right font-medium">{run.checked}</td>
                      <td className="tabular px-4 py-3 text-right text-online">{run.online}</td>
                      <td
                        className={cn(
                          'tabular px-4 py-3 text-right',
                          run.slow > 0 ? 'text-slow' : 'text-muted',
                        )}
                      >
                        {run.slow}
                      </td>
                      <td
                        className={cn(
                          'tabular px-4 py-3 text-right',
                          run.offline > 0 ? 'text-offline' : 'text-muted',
                        )}
                      >
                        {run.offline}
                      </td>
                      <td
                        className={cn(
                          'tabular px-4 py-3 text-right',
                          // Errors mean a check threw unexpectedly — a bug or a
                          // database problem — not a site being down.
                          run.errors > 0 ? 'text-offline' : 'text-muted',
                        )}
                      >
                        {run.errors}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-muted">
                        {run.durationMs === undefined ? '—' : `${formatNumber(run.durationMs)} ms`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="mt-4 text-center text-xs text-muted">
            Showing {runs.length} of {formatNumber(total)} sweeps · idle ticks are not recorded
          </p>
        </>
      )}
    </AppShell>
  );
}
