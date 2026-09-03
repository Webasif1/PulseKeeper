import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Guidance shown under the field; replaced by `error` when one is present. */
  hint?: ReactNode;
  error?: string;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, rightSlot, className, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
          {label}
          {required && (
            <span className="ml-0.5 text-offline" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      <div className="relative">
        {leftIcon && (
          <span
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          // Points at whichever message is rendered, so a screen reader
          // announces the error rather than the hint it replaced.
          aria-describedby={hint || error ? messageId : undefined}
          className={cn(
            'w-full rounded-lg border bg-[var(--surface-card)] px-3 py-2 text-sm',
            'placeholder:text-[var(--text-muted)]',
            'transition-colors focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-60',
            leftIcon && 'pl-9',
            rightSlot && 'pr-10',
            error
              ? 'border-offline focus-visible:outline-offline'
              : 'border-[var(--border-strong)]',
            className,
          )}
          {...props}
        />

        {rightSlot && (
          <span className="absolute top-1/2 right-2 -translate-y-1/2">{rightSlot}</span>
        )}
      </div>

      {(hint || error) && (
        <p
          id={messageId}
          // Errors are announced when they appear; hints are not, since they
          // are present from the start.
          role={error ? 'alert' : undefined}
          className={cn(
            'mt-1.5 text-xs',
            error ? 'text-offline' : 'text-[var(--text-muted)]',
          )}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
