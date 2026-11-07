/**
 * The gate between a change to the canonical identity files and the consumer
 * builds that read them.
 *
 * Every consumer downloads `person.jsonld` and `projects.json` from
 * raw.githubusercontent.com at build time. That host is a Fastly cache that
 * answers with `Cache-Control: max-age=300`, and each cache node keeps its own
 * copy, so for up to five minutes after a merge a node can still hand out the
 * previous file. Dispatching the builds straight after the merge let them run
 * inside that window: on 2026-11-07 (#653) libgen-mcp rebuilt about 90 s after
 * the merge and published the previous `#person`.
 *
 * Polling raw from here cannot close that window on its own, because this
 * runner and a consumer's runner may reach different cache nodes. Time closes
 * it: any copy a node holds was fetched before the change landed, so once
 * max-age (plus a margin) has passed since the push, no node can still serve
 * it. The poll that follows checks that the wait did its job, and catches a
 * cache that starts keeping files longer than its header says.
 *
 * @module
 */

/** Where the consumers download the canonical files from. */
export const RAW_ORIGIN = "https://raw.githubusercontent.com";

/** Cache lifetime assumed when raw states none: its max-age on 2026-11-07. */
export const DEFAULT_MAX_AGE_S = 300;

/** Slack on top of the cache lifetime, for clock skew between hosts. */
export const MARGIN_S = 30;

/**
 * How long a shared cache may keep a response, from its Cache-Control.
 *
 * `s-maxage` wins over `max-age` because it is the directive addressed to
 * shared caches like Fastly's; `max-age` is the fallback.
 *
 * @param {string | null | undefined} cacheControl - The header value.
 * @returns {number | null} Seconds, or null when neither directive is usable.
 */
export function cacheLifetimeSeconds(cacheControl) {
  if (!cacheControl) return null;
  const directives = new Map(
    cacheControl.split(",").map((part) => {
      const [name, value = ""] = part.trim().toLowerCase().split("=", 2);
      return [name, value];
    }),
  );
  for (const name of ["s-maxage", "max-age"]) {
    const seconds = Number.parseInt(directives.get(name) ?? "", 10);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  }
  return null;
}

/**
 * The raw.githubusercontent.com URL of one file at one ref.
 *
 * @param {{owner: string, repo: string, ref: string, path: string}} target -
 *   Repository, ref and file path.
 * @returns {string} The URL the consumers fetch.
 */
export function rawUrl({ owner, repo, ref, path }) {
  return `${RAW_ORIGIN}/${owner}/${repo}/${ref}/${path}`;
}

/**
 * Resolves after `ms` milliseconds.
 *
 * @param {number} ms - Delay.
 * @returns {Promise<void>} Settles when the delay is over.
 */
function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits until no raw.githubusercontent.com cache node can still serve a copy of
 * `paths` older than the push, then checks that the node this runner reaches
 * serves the copy that `ref` holds now.
 *
 * @param {object} options - What to wait for and the clock to wait with.
 * @param {string} options.owner - Repository owner.
 * @param {string} options.repo - Repository name.
 * @param {string} options.ref - Branch the consumers read (`main`).
 * @param {string[]} options.paths - Files to check, relative to the repo root.
 * @param {number} options.startedAt - Epoch ms no earlier than the push. The
 *   caller's own start time qualifies, since the push is what started it.
 * @param {(path: string) => Promise<Uint8Array>} options.expectedBytes - The
 *   contents of `path` at `ref` right now, from a source raw does not cache
 *   (the contents API). Asked again on every poll, so a newer push during the
 *   wait moves the target instead of failing the check.
 * @param {typeof fetch} [options.fetchImpl] - Fetch, injectable for tests.
 * @param {(ms: number) => Promise<void>} [options.sleep] - Delay function.
 * @param {() => number} [options.now] - Clock in epoch ms.
 * @param {(message: string) => void} [options.log] - Progress output.
 * @param {number} [options.pollMs] - Delay between checks after the wait.
 * @param {number} [options.verifyTimeoutMs] - How long the checks may go on.
 * @returns {Promise<{maxAgeSeconds: number, waitedMs: number, polls: number}>}
 *   The cache lifetime used, how long it slept first, and how many checks ran.
 * @throws {Error} When raw still serves an outdated copy at the deadline, or
 *   answers with an error status.
 */
export async function waitForRawFreshness({
  owner,
  repo,
  ref,
  paths,
  startedAt,
  expectedBytes,
  fetchImpl = fetch,
  sleep = defaultSleep,
  now = Date.now,
  log = console.log,
  pollMs = 10_000,
  verifyTimeoutMs = 180_000,
}) {
  /**
   * Downloads one file the way a consumer does.
   *
   * Unauthenticated on purpose: raw answers with `Vary: Authorization`, so a
   * request carrying a token would read a different cache entry from the one
   * the consumers get.
   *
   * @param {string} path - File path.
   * @returns {Promise<{bytes: Buffer, cacheControl: string | null}>} Body and
   *   the cache header it came with.
   */
  const fetchRaw = async (path) => {
    const response = await fetchImpl(rawUrl({ owner, repo, ref, path }), {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(
        `${path}: raw.githubusercontent.com answered ${response.status}`,
      );
    }
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      cacheControl: response.headers.get("cache-control"),
    };
  };

  const first = await Promise.all(paths.map(fetchRaw));
  const maxAgeSeconds = Math.max(
    ...first.map(
      (file) => cacheLifetimeSeconds(file.cacheControl) ?? DEFAULT_MAX_AGE_S,
    ),
  );

  const waitedMs = Math.max(
    0,
    startedAt + (maxAgeSeconds + MARGIN_S) * 1000 - now(),
  );
  if (waitedMs > 0) {
    log(
      `Waiting ${Math.ceil(waitedMs / 1000)} s before dispatching: ` +
        `raw.githubusercontent.com caches for ${maxAgeSeconds} s, and until ` +
        `that has passed since the push a cache node may still hold the ` +
        `previous copy.`,
    );
    await sleep(waitedMs);
  }

  const deadline = now() + verifyTimeoutMs;

  /**
   * One check of every file; schedules the next one until all match or the
   * deadline passes. Recursive rather than a loop so each await is the
   * continuation of the previous check, not an await inside a loop body.
   *
   * @param {number} polls - Checks run so far.
   * @returns {Promise<number>} Total checks once every file matches.
   */
  const check = async (polls) => {
    const [served, expected] = await Promise.all([
      Promise.all(paths.map(fetchRaw)),
      Promise.all(paths.map((path) => expectedBytes(path))),
    ]);
    const stale = paths.filter(
      (_, i) => !served[i].bytes.equals(Buffer.from(expected[i])),
    );
    if (stale.length === 0) return polls + 1;
    if (now() >= deadline) {
      throw new Error(
        `raw.githubusercontent.com still serves an outdated ${stale.join(", ")} ` +
          `after the ${maxAgeSeconds} s cache lifetime and ` +
          `${Math.round(verifyTimeoutMs / 1000)} s of checks. Dispatching now ` +
          `would rebuild the consumers against the previous copy.`,
      );
    }
    await sleep(pollMs);
    return check(polls + 1);
  };

  const polls = await check(0);
  return { maxAgeSeconds, waitedMs, polls };
}
