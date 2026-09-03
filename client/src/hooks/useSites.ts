import { useCallback, useEffect, useRef, useState } from 'react';

import * as siteService from '@/services/site.service';
import { ApiError } from '@/services/api';

import type { ListSitesParams } from '@/services/site.service';
import type { Pagination, Site } from '@/types/api';

interface UseSitesResult {
  sites: Site[];
  pagination: Pagination | null;
  /** True only for the first load; a poll must not blank the screen. */
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Replace one site in place, e.g. after a manual check. */
  replaceSite: (site: Site) => void;
  removeSite: (id: string) => void;
}

/**
 * Load and keep a list of sites.
 *
 * The distinction between `isLoading` and `isRefreshing` is the point of this
 * hook: a background poll that flipped `isLoading` would replace the whole list
 * with skeletons every interval, which looks like a crash.
 */
export function useSites(params: ListSitesParams = {}): UseSitesResult {
  const [sites, setSites] = useState<Site[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Serialised so the effect depends on the values, not on a new object
  // identity every render.
  const key = JSON.stringify(params);
  const hasLoadedOnce = useRef(false);

  // Guards against an out-of-order response: a slow request for "rec" must not
  // overwrite the newer results for "recallix".
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;

    if (hasLoadedOnce.current) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const result = await siteService.listSites(JSON.parse(key) as ListSitesParams);
      if (currentRequest !== requestId.current) return;

      setSites(result.items);
      setPagination(result.pagination);
      setError(null);
    } catch (caught) {
      if (currentRequest !== requestId.current) return;
      setError(caught instanceof ApiError ? caught.message : 'Could not load your websites');
    } finally {
      if (currentRequest === requestId.current) {
        hasLoadedOnce.current = true;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  const replaceSite = useCallback((updated: Site) => {
    setSites((current) => current.map((site) => (site.id === updated.id ? updated : site)));
  }, []);

  const removeSite = useCallback((id: string) => {
    // Removed locally rather than by refetching, so the row disappears the
    // moment the delete succeeds instead of after a round trip.
    setSites((current) => current.filter((site) => site.id !== id));
    setPagination((current) =>
      current ? { ...current, total: Math.max(0, current.total - 1) } : current,
    );
  }, []);

  return {
    sites,
    pagination,
    isLoading,
    isRefreshing,
    error,
    refresh: load,
    replaceSite,
    removeSite,
  };
}
