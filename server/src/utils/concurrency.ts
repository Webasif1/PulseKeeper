/**
 * Run tasks with a bounded number in flight.
 *
 * A dependency-free stand-in for `p-limit`. It is a dozen lines, it is the only
 * thing the sweep needs, and an open-source project is better served by one
 * fewer package in its tree.
 *
 * Results come back in the order the tasks were given, regardless of the order
 * they finish. A task that rejects is not caught here: callers wrap their own
 * work, because what should happen on failure differs per caller.
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  if (tasks.length === 0) return [];

  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= tasks.length) return;

      const task = tasks[index];
      if (!task) return;

      results[index] = await task();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
