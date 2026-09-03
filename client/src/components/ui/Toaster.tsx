import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/cn';

import type { ToastVariant } from '@/context/ToastContext';

const ICONS: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const ACCENTS: Record<ToastVariant, string> = {
  success: 'text-online',
  error: 'text-offline',
  info: 'text-brand-500',
};

/**
 * Toast outlet.
 *
 * The live region is `polite` and always present in the DOM, rather than being
 * created when a toast appears — a region added at the same moment as its
 * content is frequently not announced at all.
 */
export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.variant];

        return (
          <div
            key={toast.id}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 animate-[slide-up_0.2s_ease-out]',
              'rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] p-3.5 shadow-lg',
            )}
          >
            <Icon className={cn('mt-0.5 h-4.5 w-4.5 shrink-0', ACCENTS[toast.variant])} aria-hidden="true" />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-xs text-muted">{toast.description}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-m-1 rounded p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
