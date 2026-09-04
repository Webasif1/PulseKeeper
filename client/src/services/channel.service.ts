import { del, get, patch, post } from './api';

import type { ChannelType, NotificationChannel } from '@/types/api';

export interface ChannelListResponse {
  channels: NotificationChannel[];
  /** False when the server has no SMTP relay, so email cannot be offered. */
  emailAvailable: boolean;
}

export function listChannels(): Promise<ChannelListResponse> {
  return get<ChannelListResponse>('/api/channels');
}

export function createChannel(input: {
  type: ChannelType;
  name: string;
  target: string;
}): Promise<{ channel: NotificationChannel }> {
  return post<{ channel: NotificationChannel }>('/api/channels', input);
}

export function updateChannel(
  id: string,
  changes: { name?: string; target?: string; enabled?: boolean },
): Promise<{ channel: NotificationChannel }> {
  return patch<{ channel: NotificationChannel }>(`/api/channels/${id}`, changes);
}

export function deleteChannel(id: string): Promise<null> {
  return del<null>(`/api/channels/${id}`);
}

export function testChannel(id: string): Promise<null> {
  return post<null>(`/api/channels/${id}/test`);
}
