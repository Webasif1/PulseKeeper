import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatDuration,
  formatHostname,
  formatRelativeTime,
  formatResponseTime,
  formatUptime,
  greetingForNow,
} from './format';

afterEach(() => {
  vi.useRealTimers();
});

describe('formatRelativeTime', () => {
  it('reads "Just now" for the last few seconds', () => {
    // Clock skew between browser and server must not produce "in 3 seconds".
    expect(formatRelativeTime(new Date(Date.now() - 2000))).toBe('Just now');
    expect(formatRelativeTime(new Date(Date.now() + 3000))).toBe('Just now');
  });

  it('counts seconds, minutes, hours, and days', () => {
    expect(formatRelativeTime(new Date(Date.now() - 32_000))).toBe('32 seconds ago');
    expect(formatRelativeTime(new Date(Date.now() - 60_000))).toBe('1 minute ago');
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60_000))).toBe('5 minutes ago');
    expect(formatRelativeTime(new Date(Date.now() - 3600_000))).toBe('1 hour ago');
    expect(formatRelativeTime(new Date(Date.now() - 26 * 3600_000))).toBe('Yesterday');
  });

  it('says "Never" rather than showing an empty slot', () => {
    expect(formatRelativeTime(null)).toBe('Never');
    expect(formatRelativeTime(undefined)).toBe('Never');
  });

  it('does not crash on an unparseable value', () => {
    expect(formatRelativeTime('not-a-date')).toBe('Unknown');
  });
});

describe('formatResponseTime', () => {
  it('uses milliseconds below a second and seconds above', () => {
    expect(formatResponseTime(382)).toBe('382 ms');
    expect(formatResponseTime(1500)).toBe('1.50 s');
  });

  it('renders no data as a dash, never as zero', () => {
    // "0 ms" would claim the site answered instantly, which is a different and
    // wrong statement.
    expect(formatResponseTime(null)).toBe('—');
    expect(formatResponseTime(undefined)).toBe('—');
    expect(formatResponseTime(0)).toBe('0 ms');
  });
});

describe('formatUptime', () => {
  it('keeps two decimals', () => {
    // 99.9% is ~43 minutes of monthly downtime; 99.99% is ~4. Rounding away
    // the decimals discards the only part anyone reads.
    expect(formatUptime(99.9)).toBe('99.90%');
    expect(formatUptime(99.99)).toBe('99.99%');
    expect(formatUptime(100)).toBe('100.00%');
  });

  it('renders missing data as a dash', () => {
    expect(formatUptime(null)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('scales from seconds to days', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(300)).toBe('5m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(8100)).toBe('2h 15m');
    expect(formatDuration(90_000)).toBe('1d 1h');
  });

  it('renders missing data as a dash', () => {
    expect(formatDuration(undefined)).toBe('—');
  });
});

describe('formatHostname', () => {
  it('reduces a URL to its hostname', () => {
    expect(formatHostname('https://recallix.onrender.com/api/health')).toBe(
      'recallix.onrender.com',
    );
  });

  it('returns the input unchanged when it is not a URL', () => {
    expect(formatHostname('not a url')).toBe('not a url');
  });
});

describe('greetingForNow', () => {
  it('changes with the time of day', () => {
    expect(greetingForNow(new Date('2026-09-03T08:00:00'))).toBe('Good morning');
    expect(greetingForNow(new Date('2026-09-03T14:00:00'))).toBe('Good afternoon');
    expect(greetingForNow(new Date('2026-09-03T20:00:00'))).toBe('Good evening');
  });
});
