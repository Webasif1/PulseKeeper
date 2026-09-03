import { forwardRef, useId, type ReactNode, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const messageId = `${textareaId}-message`;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="mb-1.5 block text-sm font-medium">
          {label}
        </label>
      )}

      <textarea
        ref={ref}
        id={textareaId}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? messageId : undefined}
        className={cn(
          'w-full resize-y rounded-lg border bg-[var(--surface-card)] px-3 py-2 text-sm',
          'placeholder:text-[var(--text-muted)] transition-colors focus:outline-none',
          error ? 'border-[var(--color-offline)]' : 'border-[var(--border-strong)]',
          className,
        )}
        {...props}
      />

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
