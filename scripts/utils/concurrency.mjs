/**
 * A tiny bounded-concurrency task runner. It started in `scripts/ghc/` for
 * `build-data.mjs` and `write-summary.mjs`, and now also caps the post-build
 * passes (HTML, PNG, compression) and the GitHub repo fetches in `src/`, which
 * used to run fixed-size batches where one slow file held up its whole batch.
 * It is the one place where an `await` inside a loop is the point: each
 * worker takes the next task only when its current one settles
 * (`sonar-project.properties` says so for rule S9382).
 *
 * The ghc scripts used to fire their whole batch of InfluxDB queries through a
 * single `Promise.all` — ~19 queries at once for `build-data.mjs`'s main
 * batch, 9 more for its per-repo weekly-commits loop, 9 for
 * `write-summary.mjs`'s. Each `queryInflux()` call opens its own TCP
 * connection to the InfluxDB 3 host and holds it for up to
 * `influx.mjs`'s 20 s timeout; firing them all at once intermittently
 * exhausted the box's/query engine's concurrent-connection headroom, so a
 * request that would have succeeded alone timed out instead — and every
 * caller here already has a fallback (the committed fixture, or the last
 * good summary) that silently swallowed the failure, so the site kept
 * serving without anyone realizing every build was quietly failing over.
 * Capping concurrency (plus the one retry-on-abort in `influx.mjs`) fixes
 * the root cause instead of widening the timeout or trusting the fallback
 * to cover for it.
 *
 * @module
 */

/**
 * Runs `tasks` with at most `limit` in flight at once, preserving the
 * output order of `tasks` regardless of completion order — a drop-in
 * replacement for `Promise.all(tasks.map((t) => t()))` with a concurrency
 * cap. A task that throws rejects the returned promise the same way
 * `Promise.all` would (first rejection wins; the other in-flight tasks are
 * not cancelled, matching `Promise.all`'s own behavior).
 *
 * @template T
 * @param {Array<() => Promise<T>>} tasks - Task thunks, NOT already-invoked
 *   promises — invoking eagerly (`tasks.map((t) => t())`) would start every
 *   query immediately and defeat the concurrency cap before this function
 *   ever runs.
 * @param {number} limit - Maximum number of tasks running at once. Values
 *   `< 1` are treated as `1`; a `limit >= tasks.length` runs everything
 *   concurrently, same as `Promise.all`.
 * @returns {Promise<T[]>} Results, in the same order as `tasks`.
 */
export async function runWithConcurrency(tasks, limit) {
  const results = Array.from({ length: tasks.length });
  if (tasks.length === 0) return results;

  const workerCount = Math.max(1, Math.min(limit, tasks.length));
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
