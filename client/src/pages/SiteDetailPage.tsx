import { ArrowLeft, ExternalLink, Pause, Pencil, Play, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { HealthTimeline } from '@/components/charts/HealthTimeline';
import { ResponseTimeChart } from '@/components/charts/ResponseTimeChart';
import { StatusDistribution } from '@/components/charts/StatusDistribution';
import { TimeRangeTabs } from '@/components/charts/TimeRangeTabs';
import { UptimeWindows } from '@/components/charts/UptimeWindows';
import { AppShell } from '@/components/layout/AppShell';
import { DeleteSiteDialog } from '@/components/sites/DeleteSiteDialog';
import { SiteFormModal } from '@/components/sites/SiteFormModal';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useCheckNow } from '@/hooks/useCheckNow';
import { usePolling } from '@/hooks/usePolling';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import { useToast } from '@/hooks/useToast';
import { ApiError } from '@/services/api';
import * as analyticsService from '@/services/analytics.service';
import * as siteService from '@/services/site.service';
import {
  formatDuration,
  formatHostname,
  formatNumber,
  formatResponseTime,
  formatUptime,
} from '@/utils/format';

import type { Site, SiteAnalytics, TimeRange } from '@/types/api';

const POLL_INTERVAL_MS = 30_000;

export function SiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [site, setSite] = useState<Site | null>(null);
  const [analytics, setAnalytics] = useState<SiteAnalytics | null>(null);
  const [range, setRange] = useState<TimeRange>('24h');
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const lastChecked = useRelativeTime(site?.lastCheckedAt);

  const loadSite = useCallback(async () => {
    if (!id) return;

    try {
      const { site: loaded } = await siteService.getSite(id);
      setSite(loaded);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 404
          ? 'That website does not exist, or it belongs to another account.'
          : 'Could not load this website',
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const loadAnalytics = useCallback(async () => {
    if (!id) return;

    setIsAnalyticsLoading(true);
    try {
      setAnalytics(await analyticsService.getSiteAnalytics(id, range));
    } catch {
      // The page is still useful without charts, so a failure here is not
      // promoted to a full-page error.
      setAnalytics(null);
    } finally {
      setIsAnalyticsLoading(false);
    }
  }, [id, range]);

  useEffect(() => {
    void loadSite();
  }, [loadSite]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const refreshAll = useCallback(() => {
    void loadSite();
    void loadAnalytics();
  }, [loadSite, loadAnalytics]);

  usePolling(refreshAll, POLL_INTERVAL_MS, !isLoading && error === null);

  const { checkNow, checkingId, isCoolingDown } = useCheckNow((updated) => {
    setSite(updated);
    void loadAnalytics();
  });

  const handleTogglePause = async () => {
    if (!site) return;

    try {
      const { site: updated } = await siteService.updateSite(site.id, {
        monitoringEnabled: !site.monitoringEnabled,
      });
      setSite(updated);
      toast.success(
        updated.monitoringEnabled ? 'Monitoring resumed' : 'Monitoring paused',
      );
    } catch (caught) {
      toast.error(
        'Could not change monitoring',
        caught instanceof ApiError ? caught.message : 'Please try again',
      );
    }
  };

  if (error) {
    return (
      <AppShell title="Website">
        <Card>
          <ErrorState title="Website not available" message={error} />
          <div className="flex justify-center pb-6">
            <Link
              to="/sites"
              className="text-sm font-medium text-brand-500 hover:underline"
            >
              ← Back to all websites
            </Link>
          </div>
        </Card>
      </AppShell>
    );
  }

  const stats = analytics?.stats;

  return (
    <AppShell
      title={site?.name ?? 'Website'}
      description={site ? formatHostname(site.url) : undefined}
      actions={
        site ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => void checkNow(site.id)}
              disabled={checkingId === site.id || isCoolingDown(site.id)}
              isLoading={checkingId === site.id}
              leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
            >
              <span className="hidden sm:inline">Check now</span>
            </Button>
            <Button
              size="sm"
              onClick={() => void handleTogglePause()}
              leftIcon={
                site.monitoringEnabled ? (
                  <Pause className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4" aria-hidden="true" />
                )
              }
            >
              <span className="hidden sm:inline">
                {site.monitoringEnabled ? 'Pause' : 'Resume'}
              </span>
            </Button>
            <Button
              size="sm"
              onClick={() => setIsEditOpen(true)}
              leftIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}
            >
              <span className="hidden sm:inline">Edit</span>
            </Button>
          </div>
        ) : undefined
      }
    >
      <Link
        to="/sites"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All websites
      </Link>

      {isLoading || !site ? (
        <div className="space-y-4">
          <span className="sr-only" role="status">
            Loading this website
          </span>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    status={checkingId === site.id ? 'CHECKING' : site.currentStatus}
                  />
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--text-primary)]"
                  >
                    {site.url}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>

                {site.description && (
                  <p className="mt-2 text-sm text-secondary">{site.description}</p>
                )}

                <p className="mt-2 text-xs text-muted">
                  {site.monitoringEnabled
                    ? `Checked ${lastChecked.toLowerCase()} · every ${site.intervalMinutes} min`
                    : 'Monitoring is paused'}
                  {site.healthEndpoint && ` · checking ${site.checkUrl}`}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-2 sm:text-right">
                <div>
                  <dt className="text-[11px] tracking-wide text-muted uppercase">Response</dt>
                  <dd className="tabular mt-0.5 text-lg font-semibold">
                    {formatResponseTime(site.currentResponseTime)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-muted uppercase">HTTP</dt>
                  <dd className="tabular mt-0.5 text-lg font-semibold">
                    {site.currentStatusCode ?? '—'}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Analytics</h2>
            <TimeRangeTabs value={range} onChange={setRange} />
          </div>

          <Card>
            <CardHeader
              title="Uptime"
              description="Calculated from recorded checks, not from the current status"
            />
            <CardBody>
              <UptimeWindows uptime={analytics?.uptime} isLoading={isAnalyticsLoading} />
            </CardBody>
          </Card>

          <div className="grid gap-4 lg:grid-cols-4">
            <StatTile
              label="Average response"
              value={formatResponseTime(stats?.avgResponseTime)}
              isLoading={isAnalyticsLoading}
            />
            <StatTile
              label="Fastest"
              value={formatResponseTime(stats?.minResponseTime)}
              isLoading={isAnalyticsLoading}
            />
            <StatTile
              label="Slowest"
              value={formatResponseTime(stats?.maxResponseTime)}
              isLoading={isAnalyticsLoading}
            />
            <StatTile
              label="Downtime"
              value={formatDuration(stats?.downtimeSeconds)}
              isLoading={isAnalyticsLoading}
            />
            <StatTile
              label="Total checks"
              value={formatNumber(stats?.totalChecks)}
              isLoading={isAnalyticsLoading}
            />
            <StatTile
              label="Failed checks"
              value={formatNumber(stats?.failedChecks)}
              isLoading={isAnalyticsLoading}
            />
            <StatTile
              label="Uptime in range"
              // No checks in the window means no data, not a total outage.
              // "0.00%" would be the most alarming possible reading of an
              // empty period — which is exactly what a 1-hour range shows for
              // a site checked every 15 minutes that has been paused.
              value={
                stats && stats.totalChecks > 0 ? formatUptime(stats.uptimePercentage) : '—'
              }
              isLoading={isAnalyticsLoading}
            />
            <StatTile
              label="Failure threshold"
              value={`${site.failureThreshold} checks`}
              isLoading={false}
            />
          </div>

          <Card>
            <CardHeader
              title="Response time"
              description={`Average per interval, ${range}`}
            />
            <CardBody>
              <ResponseTimeChart
                data={analytics?.responseTime ?? []}
                range={range}
                isLoading={isAnalyticsLoading}
                height={280}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Health timeline"
              description="Most recent checks, oldest on the left"
            />
            <CardBody>
              <HealthTimeline
                entries={analytics?.timeline ?? []}
                slowThresholdMs={site.slowThresholdMs}
                isLoading={isAnalyticsLoading}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="HTTP status distribution" description={`Responses in ${range}`} />
            <CardBody>
              <StatusDistribution
                entries={analytics?.statusDistribution ?? []}
                isLoading={isAnalyticsLoading}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Danger zone"
              description="Deleting removes this website and all of its history"
            />
            <CardBody>
              <Button variant="danger" size="sm" onClick={() => setIsDeleteOpen(true)}>
                Delete website
              </Button>
            </CardBody>
          </Card>
        </div>
      )}

      <SiteFormModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        site={site}
        onSaved={(updated) => {
          setSite(updated);
          toast.success(`${updated.name} updated`);
        }}
      />

      <DeleteSiteDialog
        site={isDeleteOpen ? site : null}
        onClose={() => setIsDeleteOpen(false)}
        onDeleted={() => navigate('/sites', { replace: true })}
      />
    </AppShell>
  );
}

function StatTile({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: string;
  isLoading: boolean;
}) {
  return (
    <div className="surface-card p-4">
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
      {isLoading ? (
        <Skeleton className="mt-1.5 h-6 w-20" />
      ) : (
        <p className="tabular mt-1 text-lg font-semibold">{value}</p>
      )}
    </div>
  );
}
