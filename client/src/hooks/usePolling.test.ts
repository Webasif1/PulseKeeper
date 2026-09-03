import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePolling } from './usePolling';

/** jsdom reports "visible" and never changes it, so tests drive it directly. */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePolling', () => {
  it('calls the callback on the interval', () => {
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 1000));

    vi.advanceTimersByTime(3000);

    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('stops while the tab is hidden', () => {
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 1000));

    vi.advanceTimersByTime(2000);
    expect(callback).toHaveBeenCalledTimes(2);

    setVisibility('hidden');
    vi.advanceTimersByTime(10_000);

    // A background tab gains nothing from polling, and browsers throttle its
    // timers anyway. A forgotten tab must not make a request a minute all day.
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('refreshes immediately when the tab comes back', () => {
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 1000));

    setVisibility('hidden');
    vi.advanceTimersByTime(5000);
    callback.mockClear();

    setVisibility('visible');

    // Data that went stale while hidden should not wait a full interval.
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 1000, false));

    vi.advanceTimersByTime(5000);

    expect(callback).not.toHaveBeenCalled();
  });

  it('does not restart the interval when the callback identity changes', () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(({ fn }) => usePolling(fn, 1000), {
      initialProps: { fn: first },
    });

    vi.advanceTimersByTime(1500);
    rerender({ fn: second });
    vi.advanceTimersByTime(1000);

    // The callback is held in a ref, so an inline arrow function from a
    // re-rendering page does not reset the timer on every render.
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('clears its interval on unmount', () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => usePolling(callback, 1000));

    unmount();
    vi.advanceTimersByTime(5000);

    expect(callback).not.toHaveBeenCalled();
  });
});
