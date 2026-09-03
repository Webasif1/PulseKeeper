import { Search, X } from 'lucide-react';

import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';

import type { SiteStatus } from '@/types/api';

export interface SiteFilterState {
  search: string;
  status: SiteStatus | 'ALL';
  sort: string;
  order: 'asc' | 'desc';
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'SLOW', label: 'Slow' },
  { value: 'OFFLINE', label: 'Offline' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Recently added' },
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'responseTime', label: 'Response time' },
  { value: 'uptime', label: 'Uptime' },
  { value: 'lastChecked', label: 'Last checked' },
];

/** Search, filter, and sort (SPEC §19). */
export function SiteFilters({
  value,
  onChange,
  className,
}: {
  value: SiteFilterState;
  onChange: (next: SiteFilterState) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center', className)}>
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={value.search}
          onChange={(event) => onChange({ ...value, search: event.target.value })}
          placeholder="Search by name, URL, or tag"
          aria-label="Search websites"
          className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] py-2 pr-9 pl-9 text-sm placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        {value.search && (
          <button
            type="button"
            onClick={() => onChange({ ...value, search: '' })}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex gap-3">
        <Select
          aria-label="Filter by status"
          className="sm:w-40"
          value={value.status}
          onChange={(event) =>
            onChange({ ...value, status: event.target.value as SiteFilterState['status'] })
          }
          options={STATUS_OPTIONS}
        />

        <Select
          aria-label="Sort websites"
          className="sm:w-44"
          value={value.sort}
          onChange={(event) => {
            const sort = event.target.value;
            // Name reads naturally A→Z, while everything else is most
            // interesting at its highest value first.
            onChange({ ...value, sort, order: sort === 'name' ? 'asc' : 'desc' });
          }}
          options={SORT_OPTIONS}
        />
      </div>
    </div>
  );
}
