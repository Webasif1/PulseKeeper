import { TIME_RANGES } from '@/constants/status';
import { cn } from '@/lib/cn';

import type { TimeRange } from '@/types/api';

/** Time-range filter (SPEC §12). */
export function TimeRangeTabs({
  value,
  onChange,
  className,
}: {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      className={cn(
        'inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-0.5',
        className,
      )}
    >
      {TIME_RANGES.map((range) => {
        const isSelected = value === range.value;

        return (
          <button
            key={range.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(range.value)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              isSelected
                ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            {/* Full labels are clear but wide; the short form keeps six options
                on one row at mobile widths. */}
            <span className="sm:hidden">{range.value}</span>
            <span className="hidden sm:inline">{range.label}</span>
          </button>
        );
      })}
    </div>
  );
}
