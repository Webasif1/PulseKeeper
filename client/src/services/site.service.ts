import { del, get, patch, post } from './api';

import type { DashboardStats, Paginated, Site } from '@/types/api';

export interface SiteFormValues {
  name: string;
  url: string;
  healthEndpoint?: string;
  description?: string;
  tags?: string[];
  monitoringEnabled?: boolean;
  intervalMinutes?: number;
  timeoutSeconds?: number;
  slowThresholdMs?: number;
  failureThreshold?: number;
}

export interface ListSitesParams {
  search?: string;
  status?: string;
  tag?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/**
 * Strip empty values before sending.
 *
 * The server's schemas are `.strict()` and reject unknown keys, and an empty
 * string is not the same as an omitted optional — sending `description: ''`
 * where the user simply left the field blank would store an empty string
 * rather than nothing.
 */
function clean<T extends object>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  ) as Partial<T>;
}

export function listSites(params: ListSitesParams = {}): Promise<Paginated<Site>> {
  return get<Paginated<Site>>('/api/sites', clean(params));
}

export function getSite(id: string): Promise<{ site: Site }> {
  return get<{ site: Site }>(`/api/sites/${id}`);
}

export function createSite(values: SiteFormValues): Promise<{ site: Site }> {
  return post<{ site: Site }>('/api/sites', clean(values));
}

export function updateSite(id: string, values: Partial<SiteFormValues>): Promise<{ site: Site }> {
  // Booleans are meaningful here, so `false` must survive the clean step —
  // pausing a site sends `monitoringEnabled: false` and nothing else.
  const payload = clean(values);
  if (values.monitoringEnabled !== undefined) {
    payload.monitoringEnabled = values.monitoringEnabled;
  }
  return patch<{ site: Site }>(`/api/sites/${id}`, payload);
}

export function deleteSite(id: string): Promise<null> {
  return del<null>(`/api/sites/${id}`);
}

export function checkSiteNow(id: string): Promise<{ site: Site }> {
  return post<{ site: Site }>(`/api/sites/${id}/check`);
}

export function getDashboardStats(): Promise<DashboardStats> {
  return get<DashboardStats>('/api/dashboard/stats');
}
