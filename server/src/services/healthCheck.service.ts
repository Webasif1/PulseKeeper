import http from 'node:http';
import https from 'node:https';

import { env } from '../config/env.js';
import { CheckErrorType, SiteStatus, type CheckErrorTypeValue, type SiteStatusValue } from '../types/domain.js';
import { AppError } from '../utils/AppError.js';
import { createGuardedLookup, assertRedirectAllowed, assertUrlAllowed } from '../utils/urlGuard.js';

/**
 * Performing a single health check.
 *
 * Deliberately built on `node:http`/`node:https` rather than `fetch`, for two
 * reasons that both matter:
 *
 *  - the agent accepts a custom `lookup`, which is how the SSRF guard validates
 *    the address the socket is actually about to connect to;
 *  - redirects must be followed manually so every hop can be revalidated, and
 *    `fetch` follows them without asking.
 */

export interface HealthCheckOutcome {
  success: boolean;
  status: SiteStatusValue;
  statusCode?: number;
  responseTimeMs?: number;
  errorType?: CheckErrorTypeValue;
  errorMessage?: string;
  /** Final URL after redirects, when it differs from the one requested. */
  finalUrl?: string;
  redirects: number;
}

export interface HealthCheckOptions {
  timeoutSeconds: number;
  slowThresholdMs: number;
  maxRedirects?: number;
}

/** Node's socket-level error codes, grouped into the categories users see. */
const DNS_ERROR_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'EHOSTDOWN',
  'ENETDOWN',
  'EADDRNOTAVAIL',
  'EPROTO',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_SSL_WRONG_VERSION_NUMBER',
]);

function classifyTransportError(error: NodeJS.ErrnoException): {
  errorType: CheckErrorTypeValue;
  errorMessage: string;
} {
  const code = error.code ?? '';

  if (DNS_ERROR_CODES.has(code)) {
    return { errorType: CheckErrorType.DNS_ERROR, errorMessage: `DNS lookup failed (${code})` };
  }

  if (CONNECTION_ERROR_CODES.has(code)) {
    return {
      errorType: CheckErrorType.CONNECTION_ERROR,
      errorMessage: `Connection failed (${code})`,
    };
  }

  return {
    errorType: CheckErrorType.UNKNOWN,
    errorMessage: error.message.slice(0, 200) || 'Unknown error',
  };
}

/**
 * Decide the site's status from a check result (SPEC section 8).
 *
 * Pure, so the thresholds can be tested without any network involved.
 */
export function decideStatus(
  success: boolean,
  responseTimeMs: number | undefined,
  slowThresholdMs: number,
): SiteStatusValue {
  if (!success) return SiteStatus.OFFLINE;
  if (responseTimeMs !== undefined && responseTimeMs > slowThresholdMs) return SiteStatus.SLOW;
  return SiteStatus.ONLINE;
}

/** A response is healthy when the final status code is below 400. */
export function classifyHttpStatus(statusCode: number): {
  success: boolean;
  errorType?: CheckErrorTypeValue;
  errorMessage?: string;
} {
  if (statusCode < 400) return { success: true };

  if (statusCode >= 500) {
    return {
      success: false,
      errorType: CheckErrorType.SERVER_ERROR,
      errorMessage: `Server returned HTTP ${statusCode}`,
    };
  }

  return {
    success: false,
    errorType: CheckErrorType.HTTP_ERROR,
    errorMessage: `Server returned HTTP ${statusCode}`,
  };
}

interface SingleRequestResult {
  statusCode: number;
  location?: string;
  elapsedMs: number;
}

/**
 * One HTTP request, with no redirect handling.
 *
 * Timing stops when response headers arrive, and the body is then discarded
 * without being read. A health check asks "did this respond, and how fast" —
 * downloading a megabyte of HTML would measure the user's bandwidth rather than
 * their site's responsiveness, and would give a large page a worse score than a
 * slow one.
 */
function performRequest(url: URL, timeoutMs: number): Promise<SingleRequestResult> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const startedAt = process.hrtime.bigint();
    let settled = false;

    const request = transport.request(
      url,
      {
        method: 'GET',
        // The guard runs inside the socket's own DNS lookup, so the address
        // checked is the address connected to. This is what closes DNS
        // rebinding; see docs/SECURITY-SSRF.md.
        lookup: createGuardedLookup(),
        timeout: timeoutMs,
        headers: {
          'user-agent': 'PulseKeeper/0.1 (+https://github.com/Webasif1/PulseKeeper)',
          accept: '*/*',
          // Health checks should reflect the current state, not a cache.
          'cache-control': 'no-cache',
        },
      },
      (response) => {
        if (settled) return;
        settled = true;

        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

        // Headers are all that is needed; free the socket rather than
        // downloading a body nobody reads.
        response.destroy();

        resolve({
          statusCode: response.statusCode ?? 0,
          location: response.headers.location,
          elapsedMs: Math.round(elapsedMs),
        });
      },
    );

    request.on('timeout', () => {
      if (settled) return;
      settled = true;
      request.destroy();
      const timeoutError: NodeJS.ErrnoException = new Error('Request timed out');
      timeoutError.code = 'ETIMEDOUT';
      reject(timeoutError);
    });

    request.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });

    request.end();
  });
}

/**
 * Run a health check against a URL, following and revalidating redirects.
 *
 * Never throws for an unreachable site: an unreachable site is a result, not an
 * error. It throws only if given input it cannot interpret at all.
 */
export async function runHealthCheck(
  rawUrl: string,
  options: HealthCheckOptions,
): Promise<HealthCheckOutcome> {
  const timeoutMs = options.timeoutSeconds * 1000;
  const maxRedirects = options.maxRedirects ?? env.MONITOR_MAX_REDIRECTS;

  let current: URL;
  try {
    // Re-checked here, not just when the site was saved: DNS answers change,
    // and a name that resolved publicly last week can point at 127.0.0.1 today.
    ({ url: current } = await assertUrlAllowed(rawUrl));
  } catch (error) {
    return {
      success: false,
      status: SiteStatus.OFFLINE,
      errorType: CheckErrorType.BLOCKED_URL,
      errorMessage:
        error instanceof AppError ? error.message : 'URL is not allowed to be checked',
      redirects: 0,
    };
  }

  let totalElapsed = 0;
  let redirects = 0;

  for (;;) {
    let result: SingleRequestResult;

    try {
      result = await performRequest(current, timeoutMs);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;

      if (err.code === 'ETIMEDOUT' || err.name === 'AbortError') {
        return {
          success: false,
          status: SiteStatus.OFFLINE,
          errorType: CheckErrorType.TIMEOUT,
          errorMessage: `Request timed out after ${options.timeoutSeconds}s`,
          redirects,
        };
      }

      // The guarded lookup rejects a rebound address here, mid-connection.
      if (err instanceof AppError || err.name === 'AppError') {
        return {
          success: false,
          status: SiteStatus.OFFLINE,
          errorType: CheckErrorType.BLOCKED_URL,
          errorMessage: err.message,
          redirects,
        };
      }

      const { errorType, errorMessage } = classifyTransportError(err);
      return { success: false, status: SiteStatus.OFFLINE, errorType, errorMessage, redirects };
    }

    totalElapsed += result.elapsedMs;

    const isRedirect =
      result.statusCode >= 300 && result.statusCode < 400 && Boolean(result.location);

    if (!isRedirect) {
      const { success, errorType, errorMessage } = classifyHttpStatus(result.statusCode);

      return {
        success,
        status: decideStatus(success, totalElapsed, options.slowThresholdMs),
        statusCode: result.statusCode,
        responseTimeMs: totalElapsed,
        ...(errorType ? { errorType } : {}),
        ...(errorMessage ? { errorMessage } : {}),
        ...(redirects > 0 ? { finalUrl: current.toString() } : {}),
        redirects,
      };
    }

    if (redirects >= maxRedirects) {
      return {
        success: false,
        status: SiteStatus.OFFLINE,
        statusCode: result.statusCode,
        responseTimeMs: totalElapsed,
        errorType: CheckErrorType.HTTP_ERROR,
        errorMessage: `Too many redirects (more than ${maxRedirects})`,
        redirects,
      };
    }

    try {
      // Every hop is revalidated: a public first hop redirecting to
      // 169.254.169.254 is a standard SSRF technique.
      const next = await assertRedirectAllowed(result.location as string, current);
      current = next.url;
      redirects += 1;
    } catch (error) {
      return {
        success: false,
        status: SiteStatus.OFFLINE,
        statusCode: result.statusCode,
        responseTimeMs: totalElapsed,
        errorType: CheckErrorType.BLOCKED_URL,
        errorMessage:
          error instanceof AppError ? error.message : 'Redirect target is not allowed',
        redirects,
      };
    }
  }
}
