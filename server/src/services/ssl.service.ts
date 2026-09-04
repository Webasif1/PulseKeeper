import type { Types } from 'mongoose';

import { SSL_WARNING_DAYS } from '../constants/monitoring.js';
import { Site, type ISite } from '../models/index.js';
import { NotificationType } from '../types/domain.js';
import { createLogger } from '../utils/logger.js';
import { notify } from './notification.service.js';

import type { TlsCertificateInfo } from './healthCheck.service.js';

const log = createLogger('ssl');

type SiteWithId = ISite & { _id: Types.ObjectId };

/**
 * The warning band a given number of days falls into.
 *
 * Returns the *smallest* threshold that has been crossed, so 20 days remaining
 * sits in the 30-day band and 5 days sits in the 7-day band. `null` means the
 * certificate is comfortably valid and nothing needs saying.
 */
export function warningBandFor(daysRemaining: number): number | null {
  for (const threshold of [...SSL_WARNING_DAYS].sort((a, b) => a - b)) {
    if (daysRemaining <= threshold) return threshold;
  }
  return null;
}

/**
 * Decide whether an expiring certificate is worth announcing.
 *
 * Only when the band has tightened. Crossing 30 warns once; the next warning
 * waits for 14. A renewal that pushes the expiry back out clears the record so
 * the next genuine approach is announced again.
 */
export function shouldWarn(
  daysRemaining: number,
  alreadyWarnedAtDays: number | undefined,
): boolean {
  const band = warningBandFor(daysRemaining);
  if (band === null) return false;
  if (alreadyWarnedAtDays === undefined) return true;

  // A smaller band is a more urgent one.
  return band < alreadyWarnedAtDays;
}

export interface SslUpdate {
  sslValidTo: Date;
  sslIssuer?: string;
  sslDaysRemaining: number;
  sslCheckedAt: Date;
  sslWarnedAtDays?: number;
}

/**
 * Record a certificate observation and notify if it has entered a tighter
 * warning band.
 *
 * Returns the fields to persist, so the caller can fold them into the single
 * site update the monitoring sweep already performs rather than issuing a
 * second write per check.
 */
export async function handleCertificate(
  site: SiteWithId,
  certificate: TlsCertificateInfo,
): Promise<SslUpdate> {
  const update: SslUpdate = {
    sslValidTo: certificate.validTo,
    ...(certificate.issuer ? { sslIssuer: certificate.issuer } : {}),
    sslDaysRemaining: certificate.daysRemaining,
    sslCheckedAt: new Date(),
  };

  const band = warningBandFor(certificate.daysRemaining);

  // A renewal clears the record, so the next approach warns again.
  if (band === null) {
    if (site.sslWarnedAtDays !== undefined) {
      await Site.updateOne({ _id: site._id }, { $unset: { sslWarnedAtDays: '' } });
      log.info({ siteId: site._id.toString() }, 'Certificate renewed, expiry warnings reset');
    }
    return update;
  }

  if (!shouldWarn(certificate.daysRemaining, site.sslWarnedAtDays)) {
    // Already announced at this urgency; keep the record as it stands.
    if (site.sslWarnedAtDays !== undefined) update.sslWarnedAtDays = site.sslWarnedAtDays;
    return update;
  }

  update.sslWarnedAtDays = band;

  const hasExpired = certificate.daysRemaining < 0;

  const title = hasExpired
    ? `${site.name} has an expired certificate`
    : `${site.name} certificate expires in ${certificate.daysRemaining} day${
        certificate.daysRemaining === 1 ? '' : 's'
      }`;

  const message = hasExpired
    ? `The TLS certificate expired on ${certificate.validTo.toDateString()}. Visitors will see a security warning.`
    : `The TLS certificate expires on ${certificate.validTo.toDateString()}${
        certificate.issuer ? ` (issued by ${certificate.issuer})` : ''
      }.`;

  log.warn(
    {
      siteId: site._id.toString(),
      daysRemaining: certificate.daysRemaining,
      validTo: certificate.validTo,
    },
    hasExpired ? 'Certificate expired' : 'Certificate expiring',
  );

  await notify({
    userId: site.userId.toString(),
    siteId: site._id.toString(),
    siteName: site.name,
    siteUrl: site.url,
    type: hasExpired ? NotificationType.SSL_EXPIRED : NotificationType.SSL_EXPIRING,
    title,
    message,
  });

  return update;
}
