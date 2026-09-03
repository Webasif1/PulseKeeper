import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export function Badge({
  children,
  className,
  icon,
}: {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        'bg-[var(--surface-inset)] text-[var(--text-secondary)]',
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
