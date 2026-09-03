import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The empty state (SPEC §33).
 *
 * Always says what is missing, why the space is empty, and what to do next. An
 * empty panel with no explanation reads as a bug.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-inset)]">
        <Icon className="h-6 w-6 text-[var(--text-muted)]" aria-hidden="true" />
      </span>

      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>

      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
