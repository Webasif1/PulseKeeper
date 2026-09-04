/**
 * API types.
 *
 * A hand-written mirror of the server's response shapes. Sharing the types
 * through a third workspace was considered and rejected for now: it would tie
 * the client's build to the server's, for a surface that changes rarely and is
 * documented in docs/API.md. The trade is that these must be updated alongside
 * the server — the tests that assert response shapes are what catch drift.
 */

export type SiteStatus = 'ONLINE' | 'SLOW' | 'OFFLINE' | 'CHECKING' | 'PAUSED' | 'UNKNOWN';

export type CheckErrorType =
  | 'TIMEOUT'
  | 'DNS_ERROR'
  | 'CONNECTION_ERROR'
  | 'HTTP_ERROR'
  | 'SERVER_ERROR'
  | 'BLOCKED_URL'
  | 'UNKNOWN';

export type CheckSource = 'CRON' | 'MANUAL' | 'EXTERNAL' | 'SEED';

export type IncidentStatus = 'ACTIVE' | 'RESOLVED';

export type NotificationType =
  | 'SITE_DOWN'
  | 'SITE_UP'
  | 'SITE_SLOW'
  | 'INCIDENT_OPENED'
  | 'INCIDENT_RESOLVED';

export type ThemePreference = 'light' | 'dark' | 'system';

export type ChannelType = 'SLACK' | 'DISCORD' | 'WEBHOOK' | 'EMAIL';

export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt: string;
}

export interface Site {
  id: string;
  name: string;
  url: string;
  healthEndpoint?: string;
  /** The URL actually requested: `healthEndpoint` when set, else `url`. */
  checkUrl: string;
  description?: string;
  tags: string[];

  monitoringEnabled: boolean;
  intervalMinutes: number;
  timeoutSeconds: number;
  slowThresholdMs: number;
  failureThreshold: number;

  currentStatus: SiteStatus;
  currentResponseTime?: number;
  currentStatusCode?: number;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  consecutiveFailures: number;
  uptimePercentage: number;
  activeIncidentId?: string;

  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HealthCheckRecord {
  id: string;
  checkedAt: string;
  success: boolean;
  statusCode?: number;
  responseTimeMs?: number;
  errorType?: CheckErrorType;
  errorMessage?: string;
  source: CheckSource;
}

export interface Incident {
  id: string;
  siteId: string;
  siteName: string;
  siteUrl: string;
  status: IncidentStatus;
  reason: string;
  errorType?: CheckErrorType;
  statusCode?: number;
  startedAt: string;
  resolvedAt?: string;
  /** For an open incident this is how long it has been running so far. */
  durationSeconds?: number;
  failedChecks: number;
}

export interface AppNotification {
  id: string;
  siteId?: string;
  incidentId?: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface Settings {
  defaultIntervalMinutes: number;
  defaultTimeoutSeconds: number;
  defaultSlowThresholdMs: number;
  defaultFailureThreshold: number;
  dataRetentionDays: number;
  notifications: { onDown: boolean; onUp: boolean; onSlow: boolean };
  theme: ThemePreference;
}

export interface NotificationChannel {
  id: string;
  type: ChannelType;
  name: string;
  /** Redacted. The full webhook URL is a secret and never leaves the server. */
  targetPreview: string;
  enabled: boolean;
  lastUsedAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  consecutiveFailures: number;
  createdAt: string;
}

/** `null` means the window held no checks — not 0%, which is a total outage. */
export interface UptimeWindows {
  '24h': number | null;
  '7d': number | null;
  '30d': number | null;
  '90d': number | null;
}

export interface ResponseTimePoint {
  timestamp: string;
  avg: number;
  min: number;
  max: number;
  count: number;
}

export interface StatusDistributionEntry {
  statusCode: number | null;
  count: number;
}

export interface TimelineEntry {
  checkedAt: string;
  success: boolean;
  statusCode?: number;
  responseTimeMs?: number;
  errorType?: CheckErrorType;
}

export interface SiteStats {
  totalChecks: number;
  failedChecks: number;
  uptimePercentage: number;
  /** `null` means "no data", which is not the same as zero. */
  avgResponseTime: number | null;
  minResponseTime: number | null;
  maxResponseTime: number | null;
  downtimeSeconds: number;
}

export interface SiteAnalytics {
  range: TimeRange;
  from: string;
  to: string;
  stats: SiteStats;
  uptime: UptimeWindows;
  responseTime: ResponseTimePoint[];
  statusDistribution: StatusDistributionEntry[];
  timeline: TimelineEntry[];
}

export interface DashboardStats {
  totals: {
    sites: number;
    online: number;
    slow: number;
    offline: number;
    paused: number;
    unknown: number;
  };
  avgResponseTime: number | null;
  uptime: UptimeWindows;
  activeIncidents: number;
  responseTime: ResponseTimePoint[];
}

export interface SiteRanking {
  siteId: string;
  name: string;
  url: string;
  value: number;
}

export interface PlatformAnalytics {
  range: TimeRange;
  totals: {
    sites: number;
    checks: number;
    failedChecks: number;
    incidents: number;
    downtimeSeconds: number;
  };
  uptime: UptimeWindows;
  responseTime: ResponseTimePoint[];
  statusDistribution: StatusDistributionEntry[];
  mostReliable: SiteRanking[];
  slowest: SiteRanking[];
  mostFailing: SiteRanking[];
}

export interface MonitorRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  trigger: CheckSource;
  checked: number;
  online: number;
  slow: number;
  offline: number;
  errors: number;
  incidentsOpened: number;
  incidentsResolved: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

/** Field-level validation failures from the server's error envelope. */
export interface FieldError {
  field: string;
  message: string;
}
