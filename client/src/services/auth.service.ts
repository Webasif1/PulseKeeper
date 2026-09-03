import { get, post } from './api';

import type { User } from '@/types/api';

interface SessionResponse {
  user: User;
  token: string;
}

export function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<SessionResponse> {
  return post<SessionResponse>('/api/auth/register', input);
}

export function login(input: { email: string; password: string }): Promise<SessionResponse> {
  return post<SessionResponse>('/api/auth/login', input);
}

export function logout(): Promise<null> {
  return post<null>('/api/auth/logout');
}

export function fetchCurrentUser(): Promise<{ user: User }> {
  return get<{ user: User }>('/api/auth/me');
}
