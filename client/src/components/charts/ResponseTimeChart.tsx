import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Skeleton } from '@/components/ui/Skeleton';
import { useTheme } from '@/hooks/useTheme';
import { formatChartTime, formatDateTime, formatResponseTime } from '@/utils/format';

import type { ResponseTimePoint, TimeRange } from '@/types/api';

/**
 * Response-time trend (SPEC §13).
 *
 * The series is already downsampled by the API to roughly 60–120 points, so
 * this renders what it is given rather than thinning it further.
 */
export function ResponseTimeChart({
  data,
  range,
  isLoading,
  height = 240,
}: {
  data: ResponseTimePoint[];
  range: TimeRange;
  isLoading?: boolean;
  height?: number;
}) {
  const { resolvedTheme } = useTheme();

  if (isLoading) {
    return <Skeleton className="w-full" />;
  }

  if (data.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex flex-col items-center justify-center text-center"
      >
        <p className="text-sm font-medium">No response data yet</p>
        <p className="mt-1 text-xs text-muted">
          Points appear here once checks have run for this period.
        </p>
      </div>
    );
  }

  // Recharts cannot read CSS custom properties, so the palette is resolved here
  // from the theme the provider already knows about.
  const isDark = resolvedTheme === 'dark';
  const gridColor = isDark ? 'oklch(0.3 0.014 265)' : 'oklch(0.92 0.004 265)';
  const axisColor = isDark ? 'oklch(0.63 0.014 265)' : 'oklch(0.55 0.01 265)';
  const lineColor = 'oklch(0.62 0.18 285)';
  const surfaceColor = isDark ? 'oklch(0.25 0.013 265)' : 'white';

  const average =
    data.reduce((total, point) => total + point.avg, 0) / Math.max(1, data.length);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="response-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="timestamp"
            tickFormatter={(value: string) => formatChartTime(value, range)}
            stroke={axisColor}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />

          <YAxis
            stroke={axisColor}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(value: number) => `${Math.round(value)}ms`}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: surfaceColor,
              border: `1px solid ${gridColor}`,
              borderRadius: '0.5rem',
              fontSize: '0.75rem',
            }}
            labelFormatter={(value) => formatDateTime(value as string)}
            formatter={(value: number, name) => [
              formatResponseTime(value),
              name === 'avg' ? 'Average' : name,
            ]}
          />

          {/* The average makes a spike legible as a spike rather than as the norm. */}
          <ReferenceLine
            y={average}
            stroke={axisColor}
            strokeDasharray="4 4"
            strokeOpacity={0.7}
          />

          <Area
            type="monotone"
            dataKey="avg"
            stroke={lineColor}
            strokeWidth={2}
            fill="url(#response-fill)"
            // Animating a chart that refreshes on a poll would keep it in
            // permanent motion.
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
