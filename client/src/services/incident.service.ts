import { get } from './api';

import type { Incident, IncidentStatus, Paginated } from '@/types/api';

export interface ListIncidentsParams {
  status?: IncidentStatus | 'ALL';
  siteId?: string;
  page?: number;
  limit?: number;
}

export function listIncidents(params: ListIncidentsParams = {}): Promise<Paginated<Incident>> {
  return get<Paginated<Incident>>('/api/incidents', params);
}

export function getIncident(id: string): Promise<{ incident: Incident }> {
  return get<{ incident: Incident }>(`/api/incidents/${id}`);
}
