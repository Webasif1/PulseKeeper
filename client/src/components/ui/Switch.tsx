import { cn } from '@/lib/cn';

/**
 * A toggle built on a real checkbox.
 *
 * The input is visually hidden rather than replaced, so it keeps native
 * keyboard behaviour, form participation, and the correct role for free.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
  hideLabel = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  /**
   * Render the label for screen readers only, for rows where surrounding text
   * already makes the toggle's purpose obvious. The label is still required —
   * a switch with no accessible name is announced as just "switch".
   */
  hideLabel?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-4',
        hideLabel ? 'inline-flex' : 'justify-between',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className={cn('min-w-0', hideLabel && 'sr-only')}>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>

      <span className="relative inline-flex shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            'h-6 w-11 rounded-full transition-colors duration-200',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500',
            checked ? 'bg-brand-600' : 'bg-[var(--border-strong)]',
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </label>
  );
}
