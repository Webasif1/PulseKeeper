/**
 * Analytics time ranges (SPEC section 12).
 *
 * Each range carries the bucket size used to downsample its series. The bucket
 * counts are deliberately similar — roughly 60 to 120 points — so a chart has
 * enough shape to be useful without shipping thousands of raw checks to the
 * browser for it to throw away.
 */
export const TIME_RANGES = {
  '1h': {
    label: 'Last hour',
    milliseconds: 60 * 60 * 1000,
    bucket: { unit: 'minute' as const, binSize: 1 }, // 60 points
  },
  '24h': {
    label: 'Last 24 hours',
    milliseconds: 24 * 60 * 60 * 1000,
    bucket: { unit: 'minute' as const, binSize: 30 }, // 48 points
  },
  '7d': {
    label: 'Last 7 days',
    milliseconds: 7 * 24 * 60 * 60 * 1000,
    bucket: { unit: 'hour' as const, binSize: 2 }, // 84 points
  },
  '30d': {
    label: 'Last 30 days',
    milliseconds: 30 * 24 * 60 * 60 * 1000,
    bucket: { unit: 'hour' as const, binSize: 6 }, // 120 points
  },
  '90d': {
    label: 'Last 90 days',
    milliseconds: 90 * 24 * 60 * 60 * 1000,
    bucket: { unit: 'day' as const, binSize: 1 }, // 90 points
  },
} as const;

export type TimeRangeKey = keyof typeof TIME_RANGES;

export const TIME_RANGE_KEYS = Object.keys(TIME_RANGES) as TimeRangeKey[];

/** Windows reported side by side on the uptime panel (SPEC section 14). */
export const UPTIME_WINDOWS = ['24h', '7d', '30d', '90d'] as const;

/** Checks shown in the health timeline (SPEC section 15). */
export const TIMELINE_LENGTH = 60;
