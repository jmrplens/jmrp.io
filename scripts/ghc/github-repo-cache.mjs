/**
 * Cached GitHub REST lookups for upstream repo metadata that ghchronicle's
 * InfluxDB does not carry: star counts and public visibility for
 * THIRD-PARTY repos.
 *
 * `datos.md`, idea 2's "Advertencias": "The only star data in the DB is
 * gh_star_given.repo_stars, and it covers just 2 of these repos. Additions
 * need a collector extension or a build-time GitHub fetch." This is that
 * fetch. It is build-time only (never called from `write-summary.mjs`,
 * which must stay fast enough for a 10-minute systemd timer) and reads at
 * most a couple dozen repos — the upstream projects with a merged
 * contribution — so the unauthenticated GitHub API rate limit (60/hour) is
 * plenty; `GITHUB_TOKEN`, if set, still gets used, the same optional-token
 * pattern as `scripts/download-sources.mjs` and `src/utils/github.ts`.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

const GITHUB_API = "https://api.github.com";

/** Default on-disk cache path, relative to the repository root. */
export const DEFAULT_CACHE_PATH = ".cache/ghc/github-repos.json";

/** How long a cached entry is trusted before a repo is re-fetched. */
export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {object} RepoMeta
 * @property {number} stars
 * @property {boolean} isPrivate
 * @property {boolean} isArchived
 * @property {number} fetchedAt - `Date.now()` at fetch time.
 */

function buildHeaders(token) {
  const headers = { Accept: "application/vnd.github+json" };
  const auth = token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (auth) headers.Authorization = `Bearer ${auth}`;
  return headers;
}

/**
 * Reads the on-disk cache, or `{}` when there is none / it is unreadable.
 *
 * @param {string} cachePath - Absolute path.
 * @returns {Record<string, RepoMeta>} Cached entries, keyed by `owner/repo`.
 */
function readCache(cachePath) {
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Writes the cache atomically (temp file + rename).
 *
 * @param {string} cachePath - Absolute path.
 * @param {Record<string, RepoMeta>} cache - Entries to persist.
 */
function writeCache(cachePath, cache) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const tmpPath = `${cachePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(cache, null, 2)}\n`);
  fs.renameSync(tmpPath, cachePath);
}

/**
 * Fetches `{stars, isPrivate, isArchived}` for each `owner/repo` full name,
 * using a cached value when younger than `ttlMs` and falling back to a
 * stale cached value (rather than `undefined`) when a fetch fails — a repo
 * whose star count cannot be refreshed today should keep yesterday's
 * number, not disappear from the "Contributed to" strip.
 *
 * @param {readonly string[]} fullNames - `owner/repo` full names.
 * @param {object} [options] - Options.
 * @param {string} [options.root] - Repository root; defaults to `process.cwd()`.
 * @param {string} [options.cachePath] - Absolute cache path; overrides `root`-relative default.
 * @param {string} [options.token] - GitHub token; falls back to `GITHUB_TOKEN`/`GH_TOKEN`.
 * @param {number} [options.ttlMs] - Cache freshness window; defaults to {@link DEFAULT_CACHE_TTL_MS}.
 * @param {(line: string) => void} [options.warn] - Warning sink.
 * @returns {Promise<Record<string, RepoMeta | undefined>>} Metadata per full
 *   name; `undefined` only for a full name that has NEVER been fetched
 *   successfully.
 */
export async function fetchRepoMeta(fullNames, options = {}) {
  const {
    root = process.cwd(),
    cachePath = path.join(root, DEFAULT_CACHE_PATH),
    token,
    ttlMs = DEFAULT_CACHE_TTL_MS,
    warn = console.warn,
  } = options;

  const cache = readCache(cachePath);
  const headers = buildHeaders(token);
  const now = Date.now();
  let dirty = false;

  await Promise.all(
    fullNames.map(async (fullName) => {
      const cached = cache[fullName];
      if (cached && now - cached.fetchedAt < ttlMs) return;
      try {
        const res = await fetch(`${GITHUB_API}/repos/${fullName}`, { headers });
        if (!res.ok)
          throw new Error(`GitHub API ${res.status} for ${fullName}`);
        const data = await res.json();
        cache[fullName] = {
          stars: Number(data.stargazers_count ?? 0),
          isPrivate: Boolean(data.private),
          isArchived: Boolean(data.archived),
          fetchedAt: now,
        };
        dirty = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warn(`Could not refresh GitHub metadata for ${fullName}: ${message}`);
        // Keep whatever was cached (even if stale); do nothing otherwise.
      }
    }),
  );

  if (dirty) writeCache(cachePath, cache);

  return Object.fromEntries(
    fullNames.map((fullName) => [fullName, cache[fullName]]),
  );
}
