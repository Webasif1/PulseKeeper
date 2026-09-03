import dns from 'node:dns';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import {
  assertAddressAllowed,
  assertRedirectAllowed,
  assertUrlAllowed,
  parseAllowedUrl,
} from '../utils/urlGuard.js';
import { stubDnsAddresses as stubDns, stubDnsFailure } from './helpers/dns.js';

/**
 * SSRF guard tests.
 *
 * The most security-critical suite in the project: the backend fetches
 * user-supplied URLs, so a gap here turns the API into a proxy onto whatever
 * network it runs on. DNS is stubbed so the cases are deterministic and no test
 * depends on the internet.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('protocol and syntax rules', () => {
  it('accepts ordinary http and https URLs', () => {
    expect(parseAllowedUrl('https://example.com').hostname).toBe('example.com');
    expect(parseAllowedUrl('http://example.com/api/health').pathname).toBe('/api/health');
  });

  it.each([
    ['file:///etc/passwd', 'file'],
    ['ftp://example.com', 'ftp'],
    ['gopher://example.com', 'gopher'],
    ['data:text/plain,hello', 'data'],
    ['javascript:alert(1)', 'javascript'],
    ['dict://example.com:11211/stat', 'dict'],
  ])('rejects the %s scheme', (url) => {
    expect(() => parseAllowedUrl(url)).toThrow(/Only http:\/\/ and https:\/\//);
  });

  it('rejects a URL with no scheme', () => {
    expect(() => parseAllowedUrl('example.com')).toThrow(/valid URL/);
  });

  it('rejects embedded credentials', () => {
    // A classic parser-confusion trick: some readers treat everything before
    // the @ as the host.
    expect(() => parseAllowedUrl('https://user:pass@example.com')).toThrow(
      /embedded credentials/,
    );
    expect(() => parseAllowedUrl('https://169.254.169.254@example.com')).toThrow(
      /embedded credentials/,
    );
  });

  it('rejects an empty or blank URL', () => {
    expect(() => parseAllowedUrl('   ')).toThrow(/required/);
  });

  it('rejects an over-long URL', () => {
    expect(() => parseAllowedUrl(`https://example.com/${'a'.repeat(2100)}`)).toThrow(
      /at most 2048/,
    );
  });
});

describe('blocked hostnames', () => {
  it.each([
    'http://localhost',
    'http://localhost:8080/health',
    'http://LOCALHOST',
    'http://app.localhost',
    'http://printer.local',
    'http://db.internal',
    'http://wiki.intranet',
    'http://nas.lan',
    'http://router.home.arpa',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://instance-data',
  ])('rejects %s by name, without resolving it', (url) => {
    expect(() => parseAllowedUrl(url)).toThrow(AppError);
  });

  it('ignores a trailing dot used to escape suffix matching', () => {
    // "localhost." is the same name to a resolver, so it must not slip past.
    expect(() => parseAllowedUrl('http://localhost.')).toThrow(/not allowed/);
  });
});

describe('address literals', () => {
  it.each([
    ['http://127.0.0.1', 'loopback'],
    ['http://127.1', 'loopback shorthand'],
    ['http://0.0.0.0', 'unspecified'],
    ['http://10.0.0.5', 'private class A'],
    ['http://172.16.4.1', 'private class B'],
    ['http://172.31.255.255', 'private class B upper bound'],
    ['http://192.168.1.1', 'private class C'],
    ['http://169.254.1.1', 'link-local'],
    ['http://169.254.169.254', 'cloud metadata'],
    ['http://100.64.0.1', 'carrier-grade NAT'],
    ['http://100.100.100.100', 'Alibaba metadata'],
    ['http://192.0.0.192', 'Oracle metadata'],
    ['http://224.0.0.1', 'multicast'],
    ['http://255.255.255.255', 'broadcast'],
  ])('rejects %s (%s)', (url) => {
    expect(() => parseAllowedUrl(url)).toThrow(AppError);
  });

  it.each([
    ['http://[::1]', 'IPv6 loopback'],
    ['http://[fe80::1]', 'IPv6 link-local'],
    ['http://[fc00::1]', 'IPv6 unique-local'],
    ['http://[fd00:ec2::254]', 'AWS IPv6 metadata'],
    ['http://[::]', 'IPv6 unspecified'],
  ])('rejects %s (%s)', (url) => {
    expect(() => parseAllowedUrl(url)).toThrow(AppError);
  });

  it('rejects an IPv4-mapped IPv6 address wrapping loopback', () => {
    // ::ffff:127.0.0.1 is loopback in an IPv6 costume; unwrapping before
    // judging is what catches it.
    expect(() => parseAllowedUrl('http://[::ffff:127.0.0.1]')).toThrow(AppError);
    expect(() => parseAllowedUrl('http://[::ffff:10.0.0.1]')).toThrow(AppError);
  });

  it('rejects decimal and octal encodings of loopback', () => {
    // 2130706433 === 0x7f000001 === 127.0.0.1
    expect(() => parseAllowedUrl('http://2130706433')).toThrow(AppError);
    expect(() => parseAllowedUrl('http://0x7f000001')).toThrow(AppError);
  });

  it('accepts a public address literal', () => {
    expect(parseAllowedUrl('http://93.184.216.34').hostname).toBe('93.184.216.34');
  });

  it('does not leak the blocked address back to the caller', () => {
    // Echoing the resolved address would turn the endpoint into an internal
    // network mapper.
    try {
      parseAllowedUrl('http://192.168.1.50');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as AppError).message).not.toContain('192.168.1.50');
    }
  });
});

describe('assertAddressAllowed', () => {
  it('accepts a public unicast address', () => {
    expect(() => assertAddressAllowed('8.8.8.8', 'test')).not.toThrow();
    expect(() => assertAddressAllowed('2606:4700:4700::1111', 'test')).not.toThrow();
  });

  it('rejects a value that is not an address at all', () => {
    expect(() => assertAddressAllowed('not-an-ip', 'test')).toThrow(AppError);
  });
});

describe('DNS resolution', () => {
  it('accepts a hostname resolving to a public address', async () => {
    stubDns([{ address: '93.184.216.34', family: 4 }]);

    const result = await assertUrlAllowed('https://example.com/health');

    expect(result.addresses).toEqual(['93.184.216.34']);
  });

  it('rejects a hostname resolving to loopback', async () => {
    // The DNS-rebinding shape: a perfectly ordinary name pointing inward.
    stubDns([{ address: '127.0.0.1', family: 4 }]);

    await expect(assertUrlAllowed('https://evil.example.com')).rejects.toThrow(
      /private, loopback, or otherwise reserved/,
    );
  });

  it('rejects a hostname resolving to cloud metadata', async () => {
    stubDns([{ address: '169.254.169.254', family: 4 }]);

    await expect(assertUrlAllowed('https://metadata.example.com')).rejects.toThrow(
      /metadata endpoint/,
    );
  });

  it('rejects when any address is private, even if another is public', async () => {
    // Checking only the first answer would make the guard depend on resolver
    // ordering, which an attacker controls.
    stubDns([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.7', family: 4 },
    ]);

    await expect(assertUrlAllowed('https://mixed.example.com')).rejects.toThrow(AppError);
  });

  it('rejects a hostname that does not resolve', async () => {
    stubDnsFailure();

    await expect(assertUrlAllowed('https://nope.example.com')).rejects.toThrow(
      /Could not resolve/,
    );
  });

  it('rejects a hostname that resolves to nothing', async () => {
    stubDns([]);

    await expect(assertUrlAllowed('https://empty.example.com')).rejects.toThrow(
      /Could not resolve/,
    );
  });

  it('does not resolve an address literal', async () => {
    const lookup = vi.spyOn(dns.promises, 'lookup');

    await assertUrlAllowed('http://93.184.216.34');

    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('redirect revalidation', () => {
  it('accepts a redirect to another public URL', async () => {
    stubDns([{ address: '93.184.216.34', family: 4 }]);

    const result = await assertRedirectAllowed(
      'https://other.example.com/health',
      new URL('https://example.com'),
    );

    expect(result.url.hostname).toBe('other.example.com');
  });

  it('rejects a redirect to cloud metadata', async () => {
    // The reason redirects are followed manually: the first hop is public and
    // the second is not.
    await expect(
      assertRedirectAllowed('http://169.254.169.254/latest/meta-data/', new URL('https://example.com')),
    ).rejects.toThrow(AppError);
  });

  it('rejects a redirect that changes scheme to file', async () => {
    await expect(
      assertRedirectAllowed('file:///etc/passwd', new URL('https://example.com')),
    ).rejects.toThrow(/Only http/);
  });

  it('resolves a relative Location against the current URL', async () => {
    stubDns([{ address: '93.184.216.34', family: 4 }]);

    const result = await assertRedirectAllowed('/api/health', new URL('https://example.com/old'));

    expect(result.url.toString()).toBe('https://example.com/api/health');
  });

  it('rejects a relative redirect when the origin itself became private', async () => {
    stubDns([{ address: '192.168.0.9', family: 4 }]);

    await expect(
      assertRedirectAllowed('/next', new URL('https://flip.example.com/start')),
    ).rejects.toThrow(AppError);
  });
});
