import { useEffect, useRef } from 'react';

/**
 * Run a callback on an interval, but only while the tab is visible.
 *
 * A background tab has nothing to gain from polling: the server is the source
 * of truth and the user cannot see the result. Browsers also throttle timers in
 * hidden tabs, so the interval would be unreliable anyway. Pausing keeps a
 * forgotten tab from making a request a minute all day (SPEC §37, §38).
 *
 * The callback is held in a ref so a caller can pass an inline arrow function
 * without restarting the interval on every render.
 */
export function usePolling(callback: () => void, intervalMs: number, enabled = true): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (timer !== undefined) return;
      timer = setInterval(() => savedCallback.current(), intervalMs);
    };

    const stop = () => {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refresh immediately on return: data that went stale while hidden
        // should not wait a full interval to catch up.
        savedCallback.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
