import { ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { IncidentRow } from '@/components/incidents/IncidentRow';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePolling } from '@/hooks/usePolling';
import { ApiError } from '@/services/api';
import * as incidentService from '@/services/incident.service';
import { cn } from '@/lib/cn';

import type { Incident, IncidentStatus } from '@/types/api';

const POLL_INTERVAL_MS = 30_000;

const FILTERS: Array<{ value: IncidentStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'RESOLVED', label: 'Resolved' },
];

/** Incident history (SPEC §17). */
export function IncidentsPage() {
  const [status, setStatus] = useState<IncidentStatus | 'ALL'>('ALL');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await incidentService.listIncidents({ status, limit: 50 });
      setIncidents(result.items);
      setTotal(result.pagination.total);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load incidents');
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(load, POLL_INTERVAL_MS);

  const activeCount = incidents.filter((incident) => incident.status === 'ACTIVE').length;

  return (
    <AppShell
      title="Incidents"
      description={
        activeCount > 0
          ? `${activeCount} ongoing right now`
          : 'Outages detected across your websites'
      }
    >
      <div
        role="radiogroup"
        aria-label="Filter incidents"
        className="mb-5 inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-0.5"
      >
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            role="radio"
            aria-checked={status === filter.value}
            onClick={() => setStatus(filter.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              status === filter.value
                ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <span className="sr-only" role="status">
            Loading incidents
          </span>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="surface-card">
          <ErrorState message={error} onRetry={() => void load()} />
        </div>
      ) : incidents.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            icon={ShieldCheck}
            title={status === 'ACTIVE' ? 'Nothing is down right now' : 'No incidents recorded'}
            description={
              status === 'ACTIVE'
                ? 'Every monitored website is responding normally.'
                : 'An incident opens once a website fails its configured number of consecutive checks.'
            }
            action={
              status !== 'ALL' ? (
                <Button onClick={() => setStatus('ALL')}>Show all incidents</Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {incidents.map((incident) => (
              <IncidentRow key={incident.id} incident={incident} />
            ))}
          </div>

          {total > incidents.length && (
            <p className="mt-4 text-center text-xs text-muted">
              Showing {incidents.length} of {total} incidents
            </p>
          )}
        </>
      )}
    </AppShell>
  );
}
