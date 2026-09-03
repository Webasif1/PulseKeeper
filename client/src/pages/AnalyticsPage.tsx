import { BarChart3, Gauge, ShieldAlert, Timer, TrendingDown, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ResponseTimeChart } from '@/components/charts/ResponseTimeChart';
import { StatusDistribution } from '@/components/charts/StatusDistribution';
import { TimeRangeTabs } from '@/components/charts/TimeRangeTabs';
import { UptimeWindows } from '@/components/charts/UptimeWindows';
import { StatCard } from '@/components/dashboard/StatCard';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ApiError } from '@/services/api';
import * as analyticsService from '@/services/analytics.service';
import {
  formatDuration,
  formatNumber,
  formatResponseTime,
  formatUptime,
} from '@/utils/format';

import type { PlatformAnalytics, SiteRanking, TimeRange } from '@/types/api';

/** Account-wide analytics (SPEC §35). */
export function AnalyticsPage() {
  const [range, setRange] = useState<TimeRange>('30d');
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setAnalytics(await analyticsService.getPlatformAnalytics(range));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load analytics');
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = analytics?.totals;
  const hasData = (totals?.checks ?? 0) > 0;

  return (
    <AppShell
      title="Analytics"
      description="How your websites have behaved over time"
      actions={<TimeRangeTabs value={range} onChange={setRange} />}
    >
      {error ? (
        <Card>
          <ErrorState message={error} onRetry={() => void load()} />
        </Card>
      ) : !isLoading && !hasData ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="No analytics for this period"
            description="Once checks have run for the selected range, uptime, response times, and rankings appear here."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              label="Websites"
              value={formatNumber(totals?.sites)}
              icon={BarChart3}
              isLoading={isLoading}
            />
            <StatCard
              label="Checks"
              value={formatNumber(totals?.checks)}
              icon={Gauge}
              hint={`In the last ${range}`}
              isLoading={isLoading}
            />
            <StatCard
              label="Failed checks"
              value={formatNumber(totals?.failedChecks)}
              icon={TrendingDown}
              accent="text-offline"
              isLoading={isLoading}
            />
            <StatCard
              label="Incidents"
              value={formatNumber(totals?.incidents)}
              icon={ShieldAlert}
              accent="text-slow"
              isLoading={isLoading}
            />
            <StatCard
              label="Total downtime"
              value={formatDuration(totals?.downtimeSeconds)}
              icon={Timer}
              isLoading={isLoading}
            />
          </div>

          <Card>
            <CardHeader
              title="Overall uptime"
              description="Across every website on your account"
            />
            <CardBody>
              <UptimeWindows uptime={analytics?.uptime} isLoading={isLoading} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Response time" description={`Average across all sites, ${range}`} />
            <CardBody>
              <ResponseTimeChart
                data={analytics?.responseTime ?? []}
                range={range}
                isLoading={isLoading}
                height={280}
              />
            </CardBody>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <RankingCard
              title="Most reliable"
              description="Highest uptime"
              icon={TrendingUp}
              entries={analytics?.mostReliable ?? []}
              isLoading={isLoading}
              format={(value) => formatUptime(value)}
            />
            <RankingCard
              title="Slowest"
              description="Highest average response time"
              icon={Timer}
              entries={analytics?.slowest ?? []}
              isLoading={isLoading}
              format={(value) => formatResponseTime(value)}
            />
            <RankingCard
              title="Most failures"
              description="Most failed checks"
              icon={TrendingDown}
              entries={analytics?.mostFailing ?? []}
              isLoading={isLoading}
              format={(value) => `${formatNumber(value)} failed`}
            />
          </div>

          <Card>
            <CardHeader title="HTTP status distribution" description={`Responses in ${range}`} />
            <CardBody>
              <StatusDistribution
                entries={analytics?.statusDistribution ?? []}
                isLoading={isLoading}
              />
            </CardBody>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function RankingCard({
  title,
  description,
  icon: Icon,
  entries,
  isLoading,
  format,
}: {
  title: string;
  description: string;
  icon: typeof TrendingUp;
  entries: SiteRanking[];
  isLoading: boolean;
  format: (value: number) => string;
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
            {title}
          </span>
        }
        description={description}
      />
      <CardBody className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          // "Most failures" being empty is good news, so it says so rather
          // than showing a bare "no data".
          <p className="px-5 py-6 text-center text-sm text-muted">
            Nothing to show for this period.
          </p>
        ) : (
          <ol className="divide-y divide-[var(--border-subtle)]">
            {entries.map((entry, index) => (
              <li
                key={entry.siteId}
                className="flex items-center justify-between gap-3 px-5 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="tabular w-4 shrink-0 text-xs text-muted">{index + 1}</span>
                  <Link
                    to={`/sites/${entry.siteId}`}
                    className="truncate text-sm hover:text-brand-500 hover:underline"
                  >
                    {entry.name}
                  </Link>
                </span>
                <span className="tabular shrink-0 text-sm font-medium">
                  {format(entry.value)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
