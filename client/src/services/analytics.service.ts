import { get } from './api';

import type {
  HealthCheckRecord,
  Paginated,
  PlatformAnalytics,
  SiteAnalytics,
  TimeRange,
} from '@/types/api';

export function getSiteAnalytics(siteId: string, range: TimeRange): Promise<SiteAnalytics> {
  return get<SiteAnalytics>(`/api/sites/${siteId}/analytics`, { range });
}

export function getPlatformAnalytics(range: TimeRange): Promise<PlatformAnalytics> {
  return get<PlatformAnalytics>('/api/dashboard/analytics', { range });
}

export function getSiteHealthHistory(
  siteId: string,
  options: { page?: number; limit?: number; failedOnly?: boolean } = {},
): Promise<Paginated<HealthCheckRecord>> {
  return get<Paginated<HealthCheckRecord>>(`/api/sites/${siteId}/health`, options);
}
