import { AlertCircle, RefreshCw } from 'lucide-react';

import { Button } from './Button';

/**
 * The error state (SPEC §33).
 *
 * Offers a retry rather than only apologising: most failures here are transient
 * network problems, and a reload button is the fix a user would reach for.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-offline-soft)]">
        <AlertCircle className="h-6 w-6 text-[var(--color-offline)]" aria-hidden="true" />
      </span>

      <h3 className="text-sm font-semibold">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}

      {onRetry && (
        <Button
          className="mt-5"
          onClick={onRetry}
          leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
