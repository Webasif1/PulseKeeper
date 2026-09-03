import { Globe, Plus, SearchX } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { DeleteSiteDialog } from '@/components/sites/DeleteSiteDialog';
import { SiteCard } from '@/components/sites/SiteCard';
import { SiteFilters, type SiteFilterState } from '@/components/sites/SiteFilters';
import { SiteFormModal } from '@/components/sites/SiteFormModal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCheckNow } from '@/hooks/useCheckNow';
import { usePolling } from '@/hooks/usePolling';
import { useSites } from '@/hooks/useSites';
import { useToast } from '@/hooks/useToast';
import { useDebounced } from '@/hooks/useDebounced';
import { ApiError } from '@/services/api';
import * as siteService from '@/services/site.service';

import type { Site } from '@/types/api';

const POLL_INTERVAL_MS = 30_000;

export function SitesPage() {
  const [filters, setFilters] = useState<SiteFilterState>({
    search: '',
    status: 'ALL',
    sort: 'createdAt',
    order: 'desc',
  });

  // Typing must not fire a request per keystroke.
  const debouncedSearch = useDebounced(filters.search, 300);

  const params = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: filters.status === 'ALL' ? undefined : filters.status,
      sort: filters.sort,
      order: filters.order,
      limit: 100,
    }),
    [debouncedSearch, filters.status, filters.sort, filters.order],
  );

  const { sites, isLoading, error, refresh, replaceSite, removeSite } = useSites(params);
  const { checkNow, checkingId, isCoolingDown } = useCheckNow(replaceSite);
  const toast = useToast();

  const [editing, setEditing] = useState<Site | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Site | null>(null);

  usePolling(refresh, POLL_INTERVAL_MS);

  const handleTogglePause = useCallback(
    async (site: Site) => {
      try {
        const { site: updated } = await siteService.updateSite(site.id, {
          monitoringEnabled: !site.monitoringEnabled,
        });
        replaceSite(updated);
        toast.success(
          updated.monitoringEnabled
            ? `Monitoring resumed for ${updated.name}`
            : `Monitoring paused for ${updated.name}`,
        );
      } catch (caught) {
        toast.error(
          'Could not change monitoring',
          caught instanceof ApiError ? caught.message : 'Please try again',
        );
      }
    },
    [replaceSite, toast],
  );

  const openAddForm = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const openEditForm = (site: Site) => {
    setEditing(site);
    setIsFormOpen(true);
  };

  const isFiltering = filters.search !== '' || filters.status !== 'ALL';

  return (
    <AppShell
      title="Websites"
      description="Everything PulseKeeper is watching for you"
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
      <SiteFilters value={filters} onChange={setFilters} className="mb-5" />

      {isLoading ? (
        <div className="space-y-3">
          <span className="sr-only" role="status">
            Loading your websites
          </span>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="surface-card">
          <ErrorState message={error} onRetry={() => void refresh()} />
        </div>
      ) : sites.length === 0 ? (
        <div className="surface-card">
          {isFiltering ? (
            <EmptyState
              icon={SearchX}
              title="No websites match those filters"
              description="Try a different search term, or clear the status filter."
              action={
                <Button
                  onClick={() => setFilters({ ...filters, search: '', status: 'ALL' })}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
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
          )}
        </div>
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
            void refresh();
          }
        }}
      />

      <DeleteSiteDialog
        site={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={removeSite}
      />
    </AppShell>
  );
}
