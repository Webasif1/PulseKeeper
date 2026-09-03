import {
  ExternalLink,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Dropdown } from '@/components/ui/Dropdown';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import { cn } from '@/lib/cn';
import { formatHostname, formatResponseTime, formatUptime } from '@/utils/format';

import type { Site } from '@/types/api';

/**
 * One monitored site (SPEC §11).
 *
 * The three metrics that answer "is this healthy" — response time, HTTP status,
 * and uptime — are given equal weight and tabular figures, so the row does not
 * shift as numbers change during a poll.
 */
export function SiteCard({
  site,
  isChecking,
  isCoolingDown,
  onCheckNow,
  onEdit,
  onTogglePause,
  onDelete,
}: {
  site: Site;
  isChecking: boolean;
  isCoolingDown: boolean;
  onCheckNow: () => void;
  onEdit: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
}) {
  const lastChecked = useRelativeTime(site.lastCheckedAt);

  return (
    <article className="surface-card group flex flex-col gap-4 p-4 transition-colors hover:border-[var(--border-strong)] sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={isChecking ? 'CHECKING' : site.currentStatus} size="sm" />

          <Link
            to={`/sites/${site.id}`}
            className="truncate font-medium hover:text-[var(--color-brand-500)] hover:underline"
          >
            {site.name}
          </Link>

          {site.isDemo && (
            <span className="rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
              Demo
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <span className="truncate">{formatHostname(site.url)}</span>
          <a
            href={site.url}
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Open ${site.name} in a new tab`}
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>

        {site.tags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {site.tags.map((tag) => (
              <li
                key={tag}
                className="rounded bg-[var(--surface-inset)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
      </div>

      <dl className="grid shrink-0 grid-cols-3 gap-4 text-sm sm:gap-6">
        <div>
          <dt className="text-[11px] tracking-wide text-muted uppercase">Response</dt>
          <dd className="tabular mt-0.5 font-medium">
            {formatResponseTime(site.currentResponseTime)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted uppercase">HTTP</dt>
          <dd className="tabular mt-0.5 font-medium">{site.currentStatusCode ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted uppercase">Uptime 24h</dt>
          <dd className="tabular mt-0.5 font-medium">{formatUptime(site.uptimePercentage)}</dd>
        </div>
      </dl>

      <div className="flex shrink-0 items-center gap-2 sm:w-44 sm:justify-end">
        <span className="flex-1 text-xs text-muted sm:flex-none sm:text-right">
          {site.monitoringEnabled ? lastChecked : 'Paused'}
        </span>

        <button
          type="button"
          onClick={onCheckNow}
          disabled={isChecking || isCoolingDown}
          title={isCoolingDown ? 'Wait a moment before checking again' : 'Check now'}
          aria-label={`Check ${site.name} now`}
          className={cn(
            'rounded-lg p-2 text-[var(--text-secondary)] transition-colors',
            'hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
            'disabled:pointer-events-none disabled:opacity-40',
          )}
        >
          <RefreshCw className={cn('h-4 w-4', isChecking && 'animate-spin')} aria-hidden="true" />
        </button>

        <Dropdown
          label={`Actions for ${site.name}`}
          trigger={
            <span className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </span>
          }
          items={[
            {
              label: 'Edit',
              icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
              onSelect: onEdit,
            },
            {
              label: site.monitoringEnabled ? 'Pause monitoring' : 'Resume monitoring',
              icon: site.monitoringEnabled ? (
                <Pause className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              ),
              onSelect: onTogglePause,
            },
            {
              label: 'Delete',
              icon: <Trash2 className="h-4 w-4" aria-hidden="true" />,
              onSelect: onDelete,
              destructive: true,
            },
          ]}
        />
      </div>
    </article>
  );
}
