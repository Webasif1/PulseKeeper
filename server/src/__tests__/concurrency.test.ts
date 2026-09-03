import { describe, expect, it } from 'vitest';

import { runWithConcurrency } from '../utils/concurrency.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('runWithConcurrency', () => {
  it('returns results in input order, not completion order', async () => {
    const tasks = [
      async () => {
        await delay(30);
        return 'first';
      },
      async () => 'second',
      async () => {
        await delay(10);
        return 'third';
      },
    ];

    expect(await runWithConcurrency(tasks, 3)).toEqual(['first', 'second', 'third']);
  });

  it('never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;

    const tasks = Array.from({ length: 12 }, () => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delay(15);
      inFlight -= 1;
      return true;
    });

    await runWithConcurrency(tasks, 3);

    expect(peak).toBe(3);
  });

  it('runs every task', async () => {
    let completed = 0;
    const tasks = Array.from({ length: 25 }, () => async () => {
      completed += 1;
      return completed;
    });

    await runWithConcurrency(tasks, 4);

    expect(completed).toBe(25);
  });

  it('handles an empty list', async () => {
    expect(await runWithConcurrency([], 5)).toEqual([]);
  });

  it('handles a limit larger than the number of tasks', async () => {
    const tasks = [async () => 1, async () => 2];

    expect(await runWithConcurrency(tasks, 50)).toEqual([1, 2]);
  });

  it('propagates a rejection, since callers decide what failure means', async () => {
    const tasks = [async () => 1, async () => Promise.reject(new Error('nope'))];

    await expect(runWithConcurrency(tasks, 2)).rejects.toThrow('nope');
  });
});
