import { useId, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * A tooltip.
 *
 * Opens on hover *and* on focus, so it is reachable by keyboard, and is wired
 * with aria-describedby rather than being purely visual. Tooltips carry
 * supplementary detail only — never the sole copy of something important.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      <span aria-describedby={isVisible ? tooltipId : undefined} className="inline-flex">
        {children}
      </span>

      {isVisible && (
        <span
          id={tooltipId}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute left-1/2 z-50 w-max max-w-xs -translate-x-1/2',
            'animate-[fade-in_0.15s_ease-out] rounded-lg px-2.5 py-1.5 text-xs shadow-lg',
            'bg-[var(--surface-raised)] border border-[var(--border-strong)] text-[var(--text-primary)]',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
