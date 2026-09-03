import axios, { type AxiosError, type AxiosInstance } from 'axios';

import type { FieldError } from '@/types/api';

/**
 * The single HTTP client.
 *
 * Nothing outside `services/` calls axios directly, so the response envelope,
 * error mapping, and session expiry are each handled in exactly one place.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5050';

/** The server's success envelope (SPEC §44). */
interface SuccessEnvelope<T> {
  success: true;
  message: string;
  data: T;
}

interface ErrorEnvelope {
  success: false;
  message: string;
  error: { code: string; details?: unknown };
}

/**
 * A failed request, normalised.
 *
 * Components catch this rather than an AxiosError, so they never have to know
 * whether a failure came from the network, the server, or a validation rule.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors: FieldError[];

  constructor(message: string, code: string, status: number, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  /** True when the server rejected specific fields, so a form can show them. */
  get isValidationError(): boolean {
    return this.code === 'VALIDATION_ERROR' || this.code === 'URL_NOT_ALLOWED';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

function parseFieldErrors(details: unknown): FieldError[] {
  if (!Array.isArray(details)) return [];

  return details.filter(
    (entry): entry is FieldError =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as FieldError).field === 'string' &&
      typeof (entry as FieldError).message === 'string',
  );
}

/**
 * Broadcast when a request comes back 401.
 *
 * An event rather than a direct call into the auth context, because this module
 * is imported by the context itself — calling back into it would be circular.
 */
export const SESSION_EXPIRED_EVENT = 'pulsekeeper:session-expired';

function notifySessionExpired(): void {
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

/** Endpoints where a 401 is an expected answer, not an expired session. */
const AUTH_PROBE_PATHS = ['/api/auth/me', '/api/auth/login', '/api/auth/register'];

function createClient(): AxiosInstance {
  const client = axios.create({
    baseURL: BASE_URL,
    // Sends the HTTP-only auth cookie. The API's CORS allowlist is what makes
    // this safe.
    withCredentials: true,
    timeout: 20_000,
    headers: { 'Content-Type': 'application/json' },
  });

  client.interceptors.response.use(
    // Unwrap the envelope so callers receive `data` directly and never write
    // `response.data.data`.
    (response) => {
      const body = response.data as SuccessEnvelope<unknown> | undefined;
      return { ...response, data: body && 'data' in body ? body.data : body };
    },

    (error: AxiosError<ErrorEnvelope>) => {
      if (error.code === 'ECONNABORTED') {
        return Promise.reject(
          new ApiError('The request timed out. Check your connection.', 'TIMEOUT', 0),
        );
      }

      if (!error.response) {
        return Promise.reject(
          new ApiError(
            'Could not reach the server. Check that the API is running.',
            'NETWORK_ERROR',
            0,
          ),
        );
      }

      const { status, data } = error.response;
      const message = data?.message ?? 'Something went wrong';
      const code = data?.error?.code ?? 'INTERNAL_ERROR';

      // A 401 from a probe or a sign-in attempt is the answer to the question
      // asked, not a session that just expired mid-use.
      const path = error.config?.url ?? '';
      if (status === 401 && !AUTH_PROBE_PATHS.some((probe) => path.includes(probe))) {
        notifySessionExpired();
      }

      return Promise.reject(
        new ApiError(message, code, status, parseFieldErrors(data?.error?.details)),
      );
    },
  );

  return client;
}

export const api = createClient();

/** Thin helpers so call sites read as `get<Site>('/api/sites/1')`. */
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await api.get<T>(url, { params });
  return response.data;
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const response = await api.post<T>(url, body);
  return response.data;
}

export async function patch<T>(url: string, body?: unknown): Promise<T> {
  const response = await api.patch<T>(url, body);
  return response.data;
}

export async function del<T>(url: string): Promise<T> {
  const response = await api.delete<T>(url);
  return response.data;
}
