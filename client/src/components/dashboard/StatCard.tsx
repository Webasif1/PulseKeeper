import type { LucideIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

/**
 * One dashboard metric (SPEC §10).
 *
 * The value is the largest thing in the card and uses tabular figures, so a
 * number changing during a poll does not make the layout twitch.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  hint,
  isLoading,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Tailwind text colour class for the icon, when the metric has a status meaning. */
  accent?: string;
  hint?: string;
  isLoading?: boolean;
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
        <Icon
          className={cn('h-4 w-4 shrink-0', accent ?? 'text-[var(--text-muted)]')}
          aria-hidden="true"
        />
      </div>

      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p className="tabular mt-2 text-2xl font-semibold">{value}</p>
      )}

      {hint && !isLoading && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
