import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';

import { cn } from '@/lib/cn';
import { formatDateTime } from '@/utils/format';

import type { Site } from '@/types/api';

/**
 * TLS certificate expiry.
 *
 * Thresholds match the server's warning bands, so the colour a user sees agrees
 * with when they were actually told. Expiry is shown as a countdown rather than
 * only a date, because "expires in 6 days" prompts action and
 * "expires 11 Sep 2026" does not.
 */
export function CertificateStatus({
  site,
  className,
}: {
  site: Site;
  className?: string;
}) {
  const days = site.sslDaysRemaining;

  if (days === undefined || !site.sslValidTo) {
    // Absent for http sites and for anything not yet checked. Saying nothing is
    // better than an empty row implying something is wrong.
    return null;
  }

  const hasExpired = days < 0;
  const isUrgent = days <= 7;
  const isWarning = days <= 30;

  const Icon = hasExpired ? ShieldX : isWarning ? ShieldAlert : ShieldCheck;

  const tone = hasExpired || isUrgent ? 'text-offline' : isWarning ? 'text-slow' : 'text-online';

  const label = hasExpired
    ? 'Certificate expired'
    : days === 0
      ? 'Certificate expires today'
      : `Certificate expires in ${days} day${days === 1 ? '' : 's'}`;

  return (
    <p className={cn('flex items-center gap-1.5 text-xs', className)}>
      <Icon className={cn('h-3.5 w-3.5 shrink-0', tone)} aria-hidden="true" />
      <span className={isWarning || hasExpired ? tone : 'text-[var(--text-muted)]'}>{label}</span>
      <span className="text-muted">
        · {formatDateTime(site.sslValidTo)}
        {site.sslIssuer ? ` · ${site.sslIssuer}` : ''}
      </span>
    </p>
  );
}
