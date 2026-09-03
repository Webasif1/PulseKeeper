/**
 * Display formatting.
 *
 * Kept together so the same number never renders two ways in two places — a
 * dashboard that says "438ms" in one card and "0.44s" in another looks broken
 * even when both are correct.
 */

/** Relative time, e.g. "32 seconds ago" (SPEC §37). */
export function formatRelativeTime(value: string | Date | undefined | null): string {
  if (!value) return 'Never';

  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (Number.isNaN(seconds)) return 'Unknown';
  // Small clock differences between browser and server should not read as
  // "in 3 seconds".
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;

  const years = Math.floor(months / 12);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/** A duration in seconds, e.g. "5 minutes", "2h 14m". */
export function formatDuration(seconds: number | undefined | null): string {
  if (seconds === undefined || seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/** Response time. `null` is "no data" and must not render as 0. */
export function formatResponseTime(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Uptime percentage.
 *
 * Two decimals, because the difference between 99.9% and 99.99% is roughly 43
 * minutes of monthly downtime versus 4 — rounding it away would discard the
 * only part anyone is looking at.
 */
export function formatUptime(percentage: number | undefined | null): string {
  if (percentage === undefined || percentage === null) return '—';
  return `${percentage.toFixed(2)}%`;
}

/** Absolute timestamp for tooltips and detail rows. */
export function formatDateTime(value: string | Date | undefined | null): string {
  if (!value) return '—';

  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Short axis label; the range decides how much detail is useful. */
export function formatChartTime(value: string, range: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  if (range === '1h' || range === '24h') {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Hostname only, for compact display of a long URL. */
export function formatHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null) return '—';
  return value.toLocaleString();
}

/** Time-of-day greeting for the dashboard header (SPEC §10). */
export function greetingForNow(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
