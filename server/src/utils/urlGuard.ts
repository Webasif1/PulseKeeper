import dns from 'node:dns';
import type { LookupFunction } from 'node:net';

import ipaddr from 'ipaddr.js';

import { MONITORING_LIMITS } from '../constants/monitoring.js';
import { AppError } from './AppError.js';
import { createLogger } from './logger.js';

const log = createLogger('url-guard');

/**
 * SSRF protection (SPEC sections 6 and 7).
 *
 * The backend fetches URLs supplied by users, which makes it a potential proxy
 * into whatever network it runs on. Every outbound request must pass through
 * this module.
 *
 * Three layers, because no single one is sufficient:
 *
 *  1. `assertUrlAllowed` — syntax and hostname rules, then DNS resolution with
 *     every returned address checked. Runs when a site is created or edited, so
 *     bad input is rejected before it is ever stored.
 *  2. The same check again at check time, because DNS answers change: a name
 *     that resolved publicly yesterday can point at 127.0.0.1 today.
 *  3. `createGuardedLookup` — validation at connect time, inside the socket's
 *     DNS lookup. This is the layer that actually closes DNS rebinding: between
 *     step 2 and the TCP connection there is a window in which a short-TTL
 *     record can flip, and only a check on the address the socket is really
 *     about to use covers it.
 *
 * Redirects are followed manually by the health-check service and revalidated
 * per hop, since a public URL can redirect straight to 169.254.169.254.
 */

/** Only these schemes are ever fetched. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Hostnames and suffixes that are refused without any DNS lookup.
 *
 * Resolution would catch most of these anyway, but refusing by name gives a
 * clearer error and avoids leaking the query to a DNS server at all.
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'instance-data.ec2.internal',
]);

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.intranet',
  '.lan',
  '.home.arpa',
  '.corp',
  '.private',
];

/**
 * Cloud metadata endpoints, denied explicitly.
 *
 * Every one of these also falls inside a non-unicast range that the range check
 * rejects. They are listed anyway so the intent survives any future loosening
 * of the range policy, and so the reason appears in the logs.
 */
const BLOCKED_ADDRESSES = new Set([
  '169.254.169.254', // AWS, Azure, GCP, DigitalOcean
  '100.100.100.100', // Alibaba Cloud
  '192.0.0.192', // Oracle Cloud
  'fd00:ec2::254', // AWS IPv6
]);

/**
 * The only address category that is ever allowed.
 *
 * An allowlist, not a denylist: every range ipaddr.js knows about other than
 * public unicast — loopback, private, link-local, unique-local, carrier-grade
 * NAT, multicast, broadcast, reserved, 6to4, Teredo — is refused. A denylist
 * would need updating every time a new special-purpose range is assigned.
 */
const ALLOWED_RANGE = 'unicast';

export interface AllowedUrl {
  /** The parsed URL, safe to request. */
  url: URL;
  /** Addresses the hostname resolved to, all of them public unicast. */
  addresses: string[];
}

/** Reject an address that is not public unicast. Exported for reuse and tests. */
export function assertAddressAllowed(address: string, context: string): void {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;

  try {
    parsed = ipaddr.parse(address);
  } catch {
    throw AppError.urlNotAllowed(`${context} did not produce a usable address`);
  }

  // ::ffff:127.0.0.1 is loopback wearing an IPv6 costume. Unwrap it and judge
  // the IPv4 address it actually carries.
  if (parsed.kind() === 'ipv6') {
    const asIpv6 = parsed as ipaddr.IPv6;
    if (asIpv6.isIPv4MappedAddress()) {
      parsed = asIpv6.toIPv4Address();
    }
  }

  const normalized = parsed.toString();

  if (BLOCKED_ADDRESSES.has(normalized)) {
    throw AppError.urlNotAllowed(
      `${context} resolves to a cloud metadata endpoint, which is not allowed`,
    );
  }

  const range = parsed.range();
  if (range !== ALLOWED_RANGE) {
    // The specific address is logged but deliberately kept out of the response:
    // echoing it back would turn the endpoint into an internal DNS mapper.
    log.warn({ address: normalized, range, context }, 'Blocked non-public address');
    throw AppError.urlNotAllowed(
      `${context} resolves to a private, loopback, or otherwise reserved address, which is not allowed`,
    );
  }
}

/**
 * Parse and check a URL without touching DNS.
 *
 * Split out from the resolving check so it can run in synchronous contexts and
 * in tests, and so a syntactically hopeless URL never reaches a resolver.
 */
export function parseAllowedUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    throw AppError.urlNotAllowed('URL is required');
  }

  if (trimmed.length > MONITORING_LIMITS.maxUrlLength) {
    throw AppError.urlNotAllowed(
      `URL must be at most ${MONITORING_LIMITS.maxUrlLength} characters`,
    );
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw AppError.urlNotAllowed('Enter a valid URL, including http:// or https://');
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw AppError.urlNotAllowed('Only http:// and https:// URLs can be monitored');
  }

  // Credentials in a URL are a classic way to confuse parsers into disagreeing
  // about which host is being addressed, and monitoring never needs them.
  if (url.username || url.password) {
    throw AppError.urlNotAllowed('URLs with embedded credentials are not allowed');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');

  if (!hostname) {
    throw AppError.urlNotAllowed('URL must include a hostname');
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw AppError.urlNotAllowed(`${hostname} is not allowed`);
  }

  if (BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw AppError.urlNotAllowed('Internal network hostnames are not allowed');
  }

  // A bare IP literal skips DNS entirely, so judge it here.
  const bracketless = hostname.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(bracketless)) {
    assertAddressAllowed(bracketless, 'That address');
  }

  return url;
}

/**
 * Full check: syntax, hostname rules, and every address the hostname resolves
 * to. Throws `AppError` (400, URL_NOT_ALLOWED) on any failure.
 *
 * All resolved addresses are checked, not just the first. A hostname with both
 * a public A record and a private one must be refused — otherwise the choice of
 * which address to connect to decides whether the guard held.
 */
export async function assertUrlAllowed(rawUrl: string): Promise<AllowedUrl> {
  const url = parseAllowedUrl(rawUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  if (ipaddr.isValid(hostname)) {
    // Already validated as a literal in parseAllowedUrl.
    return { url, addresses: [hostname] };
  }

  let resolved: dns.LookupAddress[];
  try {
    resolved = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw AppError.urlNotAllowed(`Could not resolve ${hostname}. Check the address is correct.`);
  }

  if (resolved.length === 0) {
    throw AppError.urlNotAllowed(`Could not resolve ${hostname}. Check the address is correct.`);
  }

  for (const entry of resolved) {
    assertAddressAllowed(entry.address, 'That hostname');
  }

  return { url, addresses: resolved.map((entry) => entry.address) };
}

/**
 * A `dns.lookup` replacement for the HTTP agent that refuses non-public
 * addresses at connect time.
 *
 * This is the layer that defeats DNS rebinding. Checking before the request
 * leaves a window — a record with a one-second TTL can return a public address
 * to the validation lookup and a loopback address to the socket's own lookup.
 * Validating inside the lookup the socket actually uses removes the window,
 * because it is the same answer the connection is made with.
 */
export function createGuardedLookup(): LookupFunction {
  return ((hostname, options, callback) => {
    dns.lookup(hostname, options as dns.LookupOneOptions, (err, address, family) => {
      if (err) {
        callback(err, address as string, family as number);
        return;
      }

      const addresses = Array.isArray(address)
        ? (address as unknown as dns.LookupAddress[])
        : [{ address: address as string, family: family as number }];

      try {
        for (const entry of addresses) {
          assertAddressAllowed(entry.address, 'That hostname');
        }
      } catch (guardError) {
        callback(guardError as NodeJS.ErrnoException, '', 0);
        return;
      }

      callback(null, address as string, family as number);
    });
  }) as LookupFunction;
}

/**
 * Revalidate a redirect target.
 *
 * `Location` may be relative, so it is resolved against the URL that produced
 * it before being checked. A public URL redirecting to 169.254.169.254 is a
 * standard SSRF technique, which is why redirects are followed manually rather
 * than by fetch.
 */
export async function assertRedirectAllowed(
  location: string,
  currentUrl: URL,
): Promise<AllowedUrl> {
  let absolute: string;
  try {
    absolute = new URL(location, currentUrl).toString();
  } catch {
    throw AppError.urlNotAllowed('The site redirected to an invalid URL');
  }

  return assertUrlAllowed(absolute);
}
