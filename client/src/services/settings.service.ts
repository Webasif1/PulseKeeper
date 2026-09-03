import { get, patch } from './api';

import type { Settings } from '@/types/api';

export function getSettings(): Promise<{ settings: Settings }> {
  return get<{ settings: Settings }>('/api/settings');
}

export function updateSettings(changes: Partial<Settings>): Promise<{ settings: Settings }> {
  return patch<{ settings: Settings }>('/api/settings', changes);
}
