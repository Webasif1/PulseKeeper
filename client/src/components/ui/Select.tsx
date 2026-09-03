import { ChevronDown } from 'lucide-react';
import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
  options: ReadonlyArray<{ value: string | number; label: string }>;
}

/**
 * A native select, deliberately.
 *
 * A custom listbox would need keyboard, focus, and screen-reader work to match
 * what the platform already does correctly — and on mobile the native control
 * is simply better.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const messageId = `${selectId}-message`;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium">
          {label}
        </label>
      )}

      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? messageId : undefined}
          className={cn(
            'w-full appearance-none rounded-lg border bg-[var(--surface-card)] py-2 pr-9 pl-3 text-sm',
            'transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
            error ? 'border-[var(--color-offline)]' : 'border-[var(--border-strong)]',
            className,
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden="true"
        />
      </div>

      {(hint || error) && (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={cn(
            'mt-1.5 text-xs',
            error ? 'text-[var(--color-offline)]' : 'text-[var(--text-muted)]',
          )}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
