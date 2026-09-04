import http from 'node:http';
import https from 'node:https';

import { AppError } from '../../utils/AppError.js';
import { assertUrlAllowed, createGuardedLookup } from '../../utils/urlGuard.js';

/**
 * POST JSON to a user-supplied URL.
 *
 * **This is an SSRF-relevant path and is guarded exactly like a health check.**
 * A webhook URL is user input that the server then fetches, so without the
 * guard a "webhook" pointing at 169.254.169.254 would turn notification
 * delivery into a credential exfiltration primitive — and unlike a health
 * check, the response would be delivered somewhere the attacker controls.
 *
 * See docs/SECURITY-SSRF.md.
 */
const TIMEOUT_MS = 10_000;

/** Enough to be useful in an error message, not enough to be worth storing. */
const MAX_ERROR_BODY = 200;

export async function postJson(rawUrl: string, payload: unknown): Promise<void> {
  // Re-validated at send time, not just when the channel was saved: DNS answers
  // change, and a hostname that resolved publicly last week can point at
  // loopback today.
  const { url } = await assertUrlAllowed(rawUrl);

  const body = JSON.stringify(payload);
  const transport = url.protocol === 'https:' ? https : http;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const request = transport.request(
      url,
      {
        method: 'POST',
        // The guard runs inside the socket's own DNS lookup, so the address
        // checked is the address connected to.
        lookup: createGuardedLookup(),
        timeout: TIMEOUT_MS,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'user-agent': 'PulseKeeper/0.1 (+https://github.com/Webasif1/PulseKeeper)',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;

        if (status >= 200 && status < 300) {
          response.resume();
          if (!settled) {
            settled = true;
            resolve();
          }
          return;
        }

        // Slack and Discord explain refusals in the body ("no_service",
        // "invalid_webhook"), which is far more useful than the status alone.
        // An HTML error page is not: it would fill the channel's error field
        // with a doctype and a stylesheet, so only textual bodies are kept.
        const contentType = response.headers['content-type'] ?? '';
        const bodyIsUseful =
          contentType.includes('json') ||
          contentType.includes('text/plain') ||
          contentType === '';

        if (!bodyIsUseful) {
          response.resume();
          if (!settled) {
            settled = true;
            reject(new Error(`Endpoint returned HTTP ${status}`));
          }
          return;
        }

        let errorBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          if (errorBody.length < MAX_ERROR_BODY) errorBody += chunk;
        });
        response.on('end', () => {
          if (settled) return;
          settled = true;

          const detail = errorBody.replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR_BODY);

          reject(new Error(`Endpoint returned HTTP ${status}${detail ? `: ${detail}` : ''}`));
        });
      },
    );

    request.on('timeout', () => {
      if (settled) return;
      settled = true;
      request.destroy();
      reject(new Error(`Endpoint did not respond within ${TIMEOUT_MS / 1000}s`));
    });

    request.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      // The guarded lookup rejects a rebound address here, mid-connection.
      reject(error instanceof AppError ? error : new Error(error.message));
    });

    request.write(body);
    request.end();
  });
}

/** Shared target validation for the webhook-style channels. */
export async function assertWebhookTargetAllowed(
  target: string,
  expectedHostSuffix?: string,
): Promise<void> {
  const { url } = await assertUrlAllowed(target);

  if (url.protocol !== 'https:') {
    // A webhook URL is a bearer secret; sending it over plain HTTP would expose
    // it to anyone on the path.
    throw AppError.badRequest('Webhook URLs must use https://');
  }

  if (expectedHostSuffix && !url.hostname.endsWith(expectedHostSuffix)) {
    throw AppError.badRequest(
      `That does not look like a ${expectedHostSuffix} webhook URL`,
    );
  }
}
