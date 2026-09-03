import {
  Activity,
  AlertTriangle,
  CircleX,
  Gauge,
  Globe,
  Plus,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ResponseTimeChart } from '@/components/charts/ResponseTimeChart';
import { StatCard } from '@/components/dashboard/StatCard';
import { AppShell } from '@/components/layout/AppShell';
import { DeleteSiteDialog } from '@/components/sites/DeleteSiteDialog';
import { SiteCard } from '@/components/sites/SiteCard';
import { SiteFormModal } from '@/components/sites/SiteFormModal';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useCheckNow } from '@/hooks/useCheckNow';
import { usePolling } from '@/hooks/usePolling';
import { useSites } from '@/hooks/useSites';
import { useToast } from '@/hooks/useToast';
import { ApiError } from '@/services/api';
import * as siteService from '@/services/site.service';
import { formatResponseTime, formatUptime, greetingForNow } from '@/utils/format';

import type { DashboardStats, Site } from '@/types/api';

const POLL_INTERVAL_MS = 30_000;
const SITES_ON_DASHBOARD = 5;

export function DashboardPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [deleting, setDeleting] = useState<Site | null>(null);

  const {
    sites,
    isLoading: areSitesLoading,
    error: sitesError,
    refresh: refreshSites,
    replaceSite,
    removeSite,
  } = useSites({ limit: SITES_ON_DASHBOARD, sort: 'status', order: 'asc' });

  const { checkNow, checkingId, isCoolingDown } = useCheckNow(replaceSite);

  const loadStats = useCallback(async () => {
    try {
      setStats(await siteService.getDashboardStats());
      setStatsError(null);
    } catch (caught) {
      setStatsError(caught instanceof ApiError ? caught.message : 'Could not load your stats');
    } finally {
      setIsStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const refreshAll = useCallback(() => {
    void loadStats();
    void refreshSites();
  }, [loadStats, refreshSites]);

  usePolling(refreshAll, POLL_INTERVAL_MS);

  const handleTogglePause = async (site: Site) => {
    try {
      const { site: updated } = await siteService.updateSite(site.id, {
        monitoringEnabled: !site.monitoringEnabled,
      });
      replaceSite(updated);
      void loadStats();
    } catch (caught) {
      toast.error(
        'Could not change monitoring',
        caught instanceof ApiError ? caught.message : 'Please try again',
      );
    }
  };

  const firstName = user?.name.split(' ')[0] ?? 'Developer';
  const hasNoSites = !areSitesLoading && sites.length === 0;

  // Editing and deleting work here exactly as they do on the Websites page.
  // Sending someone to another page to finish an action they started here
  // would be a worse answer than wiring up the same two dialogs.
  const openAddForm = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const openEditForm = (site: Site) => {
    setEditing(site);
    setIsFormOpen(true);
  };

  return (
    <AppShell
      title="Dashboard"
      actions={
        <Button
          variant="primary"
          size="sm"
          onClick={openAddForm}
          leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
        >
          <span className="hidden sm:inline">Add website</span>
          <span className="sm:hidden">Add</span>
        </Button>
      }
    >
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">
          {greetingForNow()}, {firstName} <span aria-hidden="true">👋</span>
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          Here&apos;s the health of your monitored services.
        </p>
      </div>

      {statsError ? (
        <Card className="mb-6">
          <ErrorState message={statsError} onRetry={() => void loadStats()} />
        </Card>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Websites"
            value={stats?.totals.sites ?? 0}
            icon={Globe}
            isLoading={isStatsLoading}
          />
          <StatCard
            label="Online"
            value={stats?.totals.online ?? 0}
            icon={Zap}
            accent="text-online"
            isLoading={isStatsLoading}
          />
          <StatCard
            label="Slow"
            value={stats?.totals.slow ?? 0}
            icon={AlertTriangle}
            accent="text-slow"
            isLoading={isStatsLoading}
          />
          <StatCard
            label="Offline"
            value={stats?.totals.offline ?? 0}
            icon={CircleX}
            accent="text-offline"
            isLoading={isStatsLoading}
          />
          <StatCard
            label="Avg response"
            value={formatResponseTime(stats?.avgResponseTime)}
            icon={Gauge}
            hint="Last 24 hours"
            isLoading={isStatsLoading}
          />
          <StatCard
            label="Uptime"
            value={formatUptime(stats?.uptime['24h'])}
            icon={TrendingUp}
            hint="Last 24 hours"
            isLoading={isStatsLoading}
          />
        </div>
      )}

      {hasNoSites ? (
        <Card>
          <EmptyState
            icon={Globe}
            title="No websites monitored yet"
            description="Add your first project to start tracking uptime and response time."
            action={
              <Button
                variant="primary"
                onClick={openAddForm}
                leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              >
                Add website
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="site-health-heading">
            <div className="mb-3 flex items-center justify-between">
              <h3 id="site-health-heading" className="text-sm font-semibold">
                Website health
              </h3>
              <Link
                to="/sites"
                className="text-xs font-medium text-brand-500 hover:underline"
              >
                View all →
              </Link>
            </div>

            {areSitesLoading ? (
              <div className="space-y-3">
                <span className="sr-only" role="status">
                  Loading your websites
                </span>
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-24 w-full" />
                ))}
              </div>
            ) : sitesError ? (
              <Card>
                <ErrorState message={sitesError} onRetry={() => void refreshSites()} />
              </Card>
            ) : (
              <div className="space-y-3">
                {sites.map((site) => (
                  <SiteCard
                    key={site.id}
                    site={site}
                    isChecking={checkingId === site.id}
                    isCoolingDown={isCoolingDown(site.id)}
                    onCheckNow={() => void checkNow(site.id)}
                    onEdit={() => openEditForm(site)}
                    onTogglePause={() => void handleTogglePause(site)}
                    onDelete={() => setDeleting(site)}
                  />
                ))}
              </div>
            )}
          </section>

          <Card>
            <CardHeader
              title="Response time"
              description="Average across all your websites, last 24 hours"
              action={
                stats && stats.activeIncidents > 0 ? (
                  <Link
                    to="/incidents"
                    className="inline-flex items-center gap-1.5 rounded-full bg-offline-soft px-2.5 py-1 text-xs font-medium text-offline"
                  >
                    <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                    {stats.activeIncidents} active
                  </Link>
                ) : undefined
              }
            />
            <CardBody>
              <ResponseTimeChart
                data={stats?.responseTime ?? []}
                range="24h"
                isLoading={isStatsLoading}
              />
            </CardBody>
          </Card>
        </div>
      )}

      <SiteFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        site={editing}
        onSaved={(site, mode) => {
          if (mode === 'updated') {
            replaceSite(site);
            toast.success(`${site.name} updated`);
          } else {
            toast.success(`${site.name} added`, 'The first check runs shortly.');
          }
          refreshAll();
        }}
      />

      <DeleteSiteDialog
        site={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(id) => {
          removeSite(id);
          void loadStats();
        }}
      />
    </AppShell>
  );
}
