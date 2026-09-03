import { CheckCircle2, CircleX } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';
import { formatDateTime, formatDuration } from '@/utils/format';

import type { Incident } from '@/types/api';

/** One incident (SPEC §17). */
export function IncidentRow({ incident }: { incident: Incident }) {
  const isActive = incident.status === 'ACTIVE';
  const Icon = isActive ? CircleX : CheckCircle2;

  return (
    <article
      className={cn(
        'surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6',
        // An ongoing outage gets a coloured edge, so a long list of resolved
        // history does not hide the one thing still happening.
        isActive && 'border-l-2 border-l-offline',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            isActive ? 'text-offline' : 'text-online',
          )}
          aria-hidden="true"
        />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/sites/${incident.siteId}`}
              className="truncate font-medium hover:text-brand-500 hover:underline"
            >
              {incident.siteName}
            </Link>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                isActive
                  ? 'bg-offline-soft text-offline'
                  : 'bg-online-soft text-online',
              )}
            >
              {isActive ? 'Ongoing' : 'Resolved'}
            </span>
          </div>

          <p className="mt-0.5 truncate text-sm text-secondary">{incident.reason}</p>
        </div>
      </div>

      <dl className="grid shrink-0 grid-cols-3 gap-4 text-xs sm:gap-6">
        <div>
          <dt className="tracking-wide text-muted uppercase">Started</dt>
          <dd className="tabular mt-0.5">{formatDateTime(incident.startedAt)}</dd>
        </div>
        <div>
          {/* "Ended" rather than "Resolved": the status pill beside it already
              says Resolved, and repeating the word made the row read as though
              it held two different facts. */}
          <dt className="tracking-wide text-muted uppercase">Ended</dt>
          <dd className="tabular mt-0.5">
            {incident.resolvedAt ? formatDateTime(incident.resolvedAt) : '—'}
          </dd>
        </div>
        <div>
          <dt className="tracking-wide text-muted uppercase">
            {isActive ? 'Ongoing for' : 'Duration'}
          </dt>
          <dd
            className={cn(
              'tabular mt-0.5 font-medium',
              isActive && 'text-offline',
            )}
          >
            {formatDuration(incident.durationSeconds)}
          </dd>
        </div>
      </dl>
    </article>
  );
}
