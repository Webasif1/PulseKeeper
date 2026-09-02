import type { Response } from 'express';

import type { ErrorCodeValue } from './AppError.js';

/**
 * The single response envelope used by every endpoint (SPEC section 44).
 *
 * Keeping the shape in one place means the client's axios interceptor can unwrap
 * responses without any endpoint-specific knowledge.
 */
export interface SuccessBody<T> {
  success: true;
  message: string;
  data: T;
}

export interface ErrorBody {
  success: false;
  message: string;
  error: {
    code: ErrorCodeValue | string;
    details?: unknown;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationMeta;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'OK',
  statusCode = 200,
): Response<SuccessBody<T>> {
  return res.status(statusCode).json({ success: true, message, data });
}

export function sendCreated<T>(
  res: Response,
  data: T,
  message = 'Created',
): Response<SuccessBody<T>> {
  return sendSuccess(res, data, message, 201);
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  code: ErrorCodeValue | string,
  details?: unknown,
): Response<ErrorBody> {
  const body: ErrorBody = { success: false, message, error: { code } };
  if (details !== undefined) body.error.details = details;
  return res.status(statusCode).json(body);
}

/** Build the pagination block from a total count and the requested page. */
export function buildPagination(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  limit: number,
  message = 'OK',
): Response<SuccessBody<PaginatedData<T>>> {
  return sendSuccess(res, { items, pagination: buildPagination(total, page, limit) }, message);
}
