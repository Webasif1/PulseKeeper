import { STATUS_PRESENTATION } from '@/constants/status';
import { cn } from '@/lib/cn';

import type { SiteStatus } from '@/types/api';

/**
 * A site's status.
 *
 * Icon plus label plus colour, never colour alone (SPEC §32). Roughly one in
 * twelve men has some form of colour vision deficiency, and red/green is the
 * common case — precisely the two colours a status dashboard leans on hardest.
 */
export function StatusBadge({
  status,
  size = 'md',
  className,
}: {
  status: SiteStatus;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const presentation = STATUS_PRESENTATION[status];
  const Icon = presentation.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        presentation.background,
        presentation.text,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
      {presentation.label}
    </span>
  );
}

/**
 * A compact status dot.
 *
 * Decorative only — it always sits beside text that names the status, so it is
 * hidden from assistive technology rather than being given a label nobody can
 * see.
 */
export function StatusDot({ status, className }: { status: SiteStatus; className?: string }) {
  const presentation = STATUS_PRESENTATION[status];

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        presentation.dot,
        // Only a live outage pulses. Animating every state would make the
        // dashboard restless and the one urgent case unremarkable.
        status === 'OFFLINE' && 'animate-[pulse-ring_2s_ease-in-out_infinite]',
        className,
      )}
    />
  );
}
