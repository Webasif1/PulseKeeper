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

/**
 * SPEC section 9, plus `BLOCKED_URL`.
 *
 * The extra value is deliberate: when the SSRF guard refuses a URL at check
 * time — because its DNS record now points somewhere private — that is neither
 * a connection error nor an HTTP error, and recording it as either would
 * mislead whoever reads the timeline. It gets its own type so the UI can
 * explain what actually happened.
 */
export const CheckErrorType = {
  TIMEOUT: 'TIMEOUT',
  DNS_ERROR: 'DNS_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  HTTP_ERROR: 'HTTP_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  BLOCKED_URL: 'BLOCKED_URL',
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
  /** A TLS certificate is approaching its expiry date. */
  SSL_EXPIRING: 'SSL_EXPIRING',
  /** A TLS certificate has already expired — the site is effectively broken. */
  SSL_EXPIRED: 'SSL_EXPIRED',
} as const;

export type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType];
export const NOTIFICATION_TYPES = Object.values(NotificationType);

/**
 * Where a notification can be delivered, beyond the in-app feed.
 *
 * Slack and Discord are separate types rather than one "webhook" because each
 * expects its own payload shape — Slack wants `blocks`, Discord wants `embeds`,
 * and a generic endpoint wants neither.
 */
export const ChannelType = {
  SLACK: 'SLACK',
  DISCORD: 'DISCORD',
  WEBHOOK: 'WEBHOOK',
  EMAIL: 'EMAIL',
} as const;

export type ChannelTypeValue = (typeof ChannelType)[keyof typeof ChannelType];
export const CHANNEL_TYPES = Object.values(ChannelType);

export const ThemePreference = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

export type ThemePreferenceValue = (typeof ThemePreference)[keyof typeof ThemePreference];
export const THEME_PREFERENCES = Object.values(ThemePreference);
