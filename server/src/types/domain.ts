/**
 * Domain vocabulary shared by models, services, and the API.
 *
 * These string unions are stored in MongoDB and returned to the client, so they
 * are part of the public contract: add values freely, rename with care.
 */

/** SPEC section 8. */
export const SiteStatus = {
  ONLINE: 'ONLINE',
  SLOW: 'SLOW',
  OFFLINE: 'OFFLINE',
  CHECKING: 'CHECKING',
  PAUSED: 'PAUSED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type SiteStatusValue = (typeof SiteStatus)[keyof typeof SiteStatus];
export const SITE_STATUSES = Object.values(SiteStatus);

/** SPEC section 9. */
export const CheckErrorType = {
  TIMEOUT: 'TIMEOUT',
  DNS_ERROR: 'DNS_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  HTTP_ERROR: 'HTTP_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type CheckErrorTypeValue = (typeof CheckErrorType)[keyof typeof CheckErrorType];
export const CHECK_ERROR_TYPES = Object.values(CheckErrorType);

/** What triggered a health check, for auditing and for the monitoring log. */
export const CheckSource = {
  CRON: 'CRON',
  MANUAL: 'MANUAL',
  EXTERNAL: 'EXTERNAL',
  SEED: 'SEED',
} as const;

export type CheckSourceValue = (typeof CheckSource)[keyof typeof CheckSource];
export const CHECK_SOURCES = Object.values(CheckSource);

export const IncidentStatus = {
  ACTIVE: 'ACTIVE',
  RESOLVED: 'RESOLVED',
} as const;

export type IncidentStatusValue = (typeof IncidentStatus)[keyof typeof IncidentStatus];
export const INCIDENT_STATUSES = Object.values(IncidentStatus);

/** SPEC section 18. */
export const NotificationType = {
  SITE_DOWN: 'SITE_DOWN',
  SITE_UP: 'SITE_UP',
  SITE_SLOW: 'SITE_SLOW',
  INCIDENT_OPENED: 'INCIDENT_OPENED',
  INCIDENT_RESOLVED: 'INCIDENT_RESOLVED',
} as const;

export type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType];
export const NOTIFICATION_TYPES = Object.values(NotificationType);

export const ThemePreference = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

export type ThemePreferenceValue = (typeof ThemePreference)[keyof typeof ThemePreference];
export const THEME_PREFERENCES = Object.values(ThemePreference);
