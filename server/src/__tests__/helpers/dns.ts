import dns from 'node:dns';

import { vi } from 'vitest';

/**
 * DNS stubs.
 *
 * The URL guard resolves hostnames, so tests stub the resolver: the cases stay
 * deterministic, the suite never depends on the internet, and a private address
 * can be returned for a public-looking name to exercise the rebinding path.
 *
 * `mockResolvedValue` is cast because `dns.promises.lookup` is overloaded and
 * TypeScript picks the single-address signature; the `all: true` call the guard
 * makes returns an array.
 */
export function stubDnsAddresses(addresses: Array<{ address: string; family: number }>): void {
  vi.spyOn(dns.promises, 'lookup').mockResolvedValue(addresses as never);
}

/** The default for most tests: every hostname looks like an ordinary public site. */
export function stubDnsPublic(): void {
  stubDnsAddresses([{ address: '93.184.216.34', family: 4 }]);
}

export function stubDnsFailure(): void {
  vi.spyOn(dns.promises, 'lookup').mockRejectedValue(new Error('ENOTFOUND'));
}
