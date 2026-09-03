import { get } from './api';

import type { MonitorRun, Paginated } from '@/types/api';

export function listMonitorRuns(
  options: { page?: number; limit?: number } = {},
): Promise<Paginated<MonitorRun>> {
  return get<Paginated<MonitorRun>>('/api/monitor/runs', options);
}
