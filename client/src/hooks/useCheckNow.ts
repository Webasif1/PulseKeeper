import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/services/api';
import * as siteService from '@/services/site.service';
import { useToast } from '@/hooks/useToast';

import type { Site } from '@/types/api';

/**
 * The server allows 10 manual checks a minute. The client cools down for six
 * seconds after each one so a user cannot casually spend that budget and then
 * meet a 429 they did not cause deliberately.
 */
const COOLDOWN_MS = 6000;

interface UseCheckNowResult {
  checkNow: (siteId: string) => Promise<void>;
  /** The site currently being checked, if any. */
  checkingId: string | null;
  isCoolingDown: (siteId: string) => boolean;
}

/**
 * "Check Now" (SPEC §21).
 *
 * Shows a loading state, reports the outcome as a toast, and hands the updated
 * site back to the caller so the row refreshes without a full reload.
 */
export function useCheckNow(onChecked: (site: Site) => void): UseCheckNowResult {
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const toast = useToast();
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const checkNow = useCallback(
    async (siteId: string) => {
      setCheckingId(siteId);

      try {
        const { site } = await siteService.checkSiteNow(siteId);
        onChecked(site);

        // The result is the point of pressing the button, so name it rather
        // than saying "done".
        if (site.currentStatus === 'ONLINE') {
          toast.success(`${site.name} is online`, `Responded in ${site.currentResponseTime} ms`);
        } else if (site.currentStatus === 'SLOW') {
          toast.toast({
            variant: 'info',
            title: `${site.name} is slow`,
            description: `Responded in ${site.currentResponseTime} ms`,
          });
        } else {
          toast.error(`${site.name} is offline`, 'The check did not succeed');
        }

        setCooldowns((current) => ({ ...current, [siteId]: Date.now() + COOLDOWN_MS }));
        timers.current.push(
          setTimeout(() => {
            setCooldowns((current) => {
              const next = { ...current };
              delete next[siteId];
              return next;
            });
          }, COOLDOWN_MS),
        );
      } catch (caught) {
        if (caught instanceof ApiError && caught.isRateLimited) {
          toast.error('Too many checks', 'Wait a moment before checking again.');
        } else {
          toast.error(
            'Check failed',
            caught instanceof ApiError ? caught.message : 'Could not reach the API',
          );
        }
      } finally {
        setCheckingId(null);
      }
    },
    [onChecked, toast],
  );

  const isCoolingDown = useCallback(
    (siteId: string) => {
      const until = cooldowns[siteId];
      return until !== undefined && until > Date.now();
    },
    [cooldowns],
  );

  return { checkNow, checkingId, isCoolingDown };
}
