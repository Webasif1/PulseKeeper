import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/** Errors stay longer, because they usually need reading rather than glancing. */
const DURATION: Record<ToastVariant, number> = {
  success: 4000,
  info: 5000,
  error: 7000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));

    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, 'id'>) => {
      const id = crypto.randomUUID();
      setToasts((current) => {
        const next = [...current, { ...input, id }];
        // A stack of toasts hides the page behind it; keep only the newest few.
        return next.slice(-3);
      });

      const timer = setTimeout(() => dismiss(id), DURATION[input.variant]);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const success = useCallback(
    (title: string, description?: string) => toast({ variant: 'success', title, description }),
    [toast],
  );

  const error = useCallback(
    (title: string, description?: string) => toast({ variant: 'error', title, description }),
    [toast],
  );

  const value = useMemo(
    () => ({ toasts, toast, success, error, dismiss }),
    [toasts, toast, success, error, dismiss],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
