/**
 * Distribution channels of the owner's public projects and the download
 * counters they expose, fetched at build time.
 *
 * One module because three consumers need the SAME number: the pre-build
 * integration that writes `src/data/downloads.json` (homepage terminal), the
 * Astro CV page, and the LaTeX CV generators (plain Node, hence `.mjs` with a
 * sibling `.d.mts` — the same arrangement as `cv/github-stats.mjs`). A project
 * shipped through more than one channel is the normal case, not the exception,
 * so combining them lives here rather than in each caller.
 *
 * @module
 */

import process from "node:process";

const UA = "jmrp.io-build (https://jmrp.io/)";
const GITHUB_API = "https://api.github.com";

/** GitHub account that owns every project listed below. */
export const OWNER = "jmrplens";

/**
 * Per-project distribution channels, keyed by GitHub repository name — the
 * same key `projects.yaml` uses as `id` and the one a CV GitHub link resolves
 * to, so a project is looked up by one identifier everywhere.
 *
 * `releases` counts the cumulative `download_count` of every release asset;
 * `docker` sums the cumulative `pull_count` of each Docker Hub image.
 *
 * `manual` is a count that cannot be fetched: MathWorks answers 403 to any
 * scripted request, so the File Exchange figures are read by hand from the
 * submission pages and carry the date they were read. They only ever grow
 * (~11/month across the four submissions), so a stale value understates the
 * project rather than overstating it.
 *
 * Channels deliberately NOT counted, each for a different reason:
 *
 * - **Glama, cursor.directory, mcp.so, the MCP Registry, mcp.jmrp.io**:
 *   listings and documentation pages, not distribution channels — none of
 *   them publishes a download counter. LobeHub is the only one with a number
 *   ("63 installs" on 2026-08-27), and an install of a hosted server is not a
 *   download of the software.
 * - **ghcr.io**: the images are mirrored there (`ghcr.io/jmrplens/*`), but the
 *   GitHub Packages API exposes no download count for containers — verified
 *   2026-08-27, the package objects have no such field.
 * - **Zenodo** (`gitlab-mcp-server`): the archive of each release exists and
 *   its API does report downloads, but the figure is 9 across all versions —
 *   an archive of record, not a way anyone installs this.
 * - **PyPI** (`phonometry`, `jmrplens-gitlab-mcp-server`): publishes no
 *   lifetime counter. `pypistats` only
 *   serves a rolling 180-day window (820 downloads without mirrors on
 *   2026-08-27), and folding a window into a cumulative total would let the
 *   published figure go DOWN between builds as the window rolls. `pepy.tech`
 *   does have a lifetime number but gates it behind an API key, and its
 *   free badge rounds to one significant figure ("2k").
 * - **npm**: the `gitlab-mcp-server` package on the registry belongs to a
 *   different author (`unadlib`), not to this owner. Verified 2026-08-27.
 * - **CrowdSec Hub** (`cs-routeros-bouncer`): its download buttons point at
 *   the project's GitHub release assets, so hub traffic is already inside the
 *   `releases` figure. Counting the hub too would double-count it.
 * - **`portainer-mcp-enhanced`**: an archived fork of `portainer/portainer-mcp`
 *   (287 asset downloads), not an authored project.
 */
export const DOWNLOAD_SOURCES = {
  "gitlab-mcp-server": {
    releases: true,
    docker: [`${OWNER}/gitlab-mcp-server`],
  },
  "libgen-mcp": { releases: true, docker: [`${OWNER}/libgen-mcp`] },
  "cs-routeros-bouncer": { releases: true, docker: [] },
  // No releases yet (the first is in the making) — listed so the count starts
  // being picked up the moment one is published, with no edit here.
  "portainer-mcp": { releases: true, docker: [] },
  "Cloudflare-DNS-Updater": { releases: true, docker: [] },
  "A-Lab": {
    releases: true,
    docker: [],
    manual: { source: "MATLAB Central File Exchange", count: 656 },
  },
  "LoVE-BASS": { releases: true, docker: [] },
  "TFG-TFM_EPS": { releases: true, docker: [] },
  SetFigPaper: {
    releases: false,
    docker: [],
    manual: { source: "MATLAB Central File Exchange", count: 263 },
  },
  FDTDexamples: {
    releases: false,
    docker: [],
    manual: { source: "MATLAB Central File Exchange", count: 215 },
  },
  CATT2Matlab: {
    releases: false,
    docker: [],
    manual: { source: "MATLAB Central File Exchange", count: 88 },
  },
};

/**
 * Date the {@link DOWNLOAD_SOURCES} `manual` counts were last read from the
 * File Exchange pages. Published in `downloads.json` so the staleness of a
 * hand-read number is visible rather than implied.
 */
export const MANUAL_COUNTS_VERIFIED_ON = "2026-08-27";

/**
 * Minimum download count a project must reach before its own figure is shown
 * next to it (CV metric badge, project card). Below this the number says
 * nothing flattering and invites the reader to do the comparison for us — the
 * grand total on the homepage still includes every project regardless.
 */
export const DOWNLOADS_DISPLAY_MIN = 1000;

/** @type {Map<string, Promise<{total:number, releases:number, docker:number, manual:number}>>} */
const cache = new Map();

/**
 * Builds GitHub API request headers (with auth when a token is available).
 *
 * The token is threaded in from the caller rather than read here only: the
 * pre-build integration gets it from Astro's loaded env, which is not
 * guaranteed to have reached `process.env` by the time the hook runs.
 *
 * @param {string} [token] - GitHub token; falls back to the environment.
 * @returns {Record<string, string>} Request headers.
 */
function ghHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": UA,
  };
  const auth = token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (auth) headers.Authorization = `Bearer ${auth}`;
  return headers;
}

/**
 * Sums `download_count` across every release asset of a repo, following
 * pagination. Throws on a non-OK response so the caller can fall back.
 *
 * @param {string} repo - Repository name under {@link OWNER}.
 * @param {string} [token] - GitHub token; falls back to the environment.
 * @returns {Promise<number>} Total asset downloads for the repo.
 */
export async function fetchReleaseDownloads(repo, token) {
  let total = 0;
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `${GITHUB_API}/repos/${OWNER}/${repo}/releases?per_page=100&page=${page}`,
      { headers: ghHeaders(token), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) throw new Error(`GitHub ${repo} releases: ${res.status}`);

    const releases = await res.json();
    if (!Array.isArray(releases) || releases.length === 0) break;

    for (const release of releases) {
      for (const asset of release.assets ?? []) {
        total += asset.download_count ?? 0;
      }
    }
    if (releases.length < 100) break; // last page
  }
  return total;
}

/**
 * Reads the cumulative `pull_count` of a single Docker Hub image.
 *
 * @param {string} slug - `namespace/repository` slug.
 * @returns {Promise<number>} The image's pull count.
 */
export async function fetchDockerHubPulls(slug) {
  const res = await fetch(`https://hub.docker.com/v2/repositories/${slug}/`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Docker Hub ${slug}: ${res.status}`);

  // Optional chaining guards a null/malformed 200 body; throwing (rather than
  // returning 0) keeps the refresh atomic — the caller's catch then preserves
  // the last good total instead of persisting a partial one.
  const repo = await res.json();
  if (typeof repo?.pull_count !== "number") {
    throw new TypeError(`Docker Hub ${slug}: missing pull_count`);
  }
  return repo.pull_count;
}

/**
 * Combined download count of one project across every channel it ships
 * through. Cached per process, so the CV page and the LaTeX generators do not
 * re-fetch what the pre-build step already asked for.
 *
 * @param {string} repo - Repository name under {@link OWNER}.
 * @param {string} [token] - GitHub token; falls back to the environment.
 * @returns {Promise<{total:number, releases:number, docker:number, manual:number}>} Counts per channel.
 */
export function fetchProjectDownloads(repo, token) {
  const cached = cache.get(repo);
  if (cached) return cached;

  const config = DOWNLOAD_SOURCES[repo];
  if (!config)
    return Promise.resolve({ total: 0, releases: 0, docker: 0, manual: 0 });

  const promise = (async () => {
    const [releases, dockerCounts] = await Promise.all([
      config.releases ? fetchReleaseDownloads(repo, token) : 0,
      Promise.all((config.docker ?? []).map(fetchDockerHubPulls)),
    ]);
    const docker = dockerCounts.reduce((sum, n) => sum + n, 0);
    const manual = config.manual?.count ?? 0;
    return { total: releases + docker + manual, releases, docker, manual };
  })();

  // Don't cache a rejection: a later caller should be able to retry.
  promise.catch(() => cache.delete(repo));
  cache.set(repo, promise);
  return promise;
}

/**
 * Fetches every configured project at once and aggregates the grand total.
 *
 * @param {string} [token] - GitHub token; falls back to the environment.
 * @returns {Promise<{total:number, sources:{githubReleases:number, dockerHub:number, manual:number}, manualVerifiedOn:string, projects:Record<string,{total:number, releases:number, docker:number, manual:number}>}>} The full breakdown.
 */
export async function fetchAllDownloads(token) {
  const repos = Object.keys(DOWNLOAD_SOURCES);
  const counts = await Promise.all(
    repos.map((repo) => fetchProjectDownloads(repo, token)),
  );

  /** @type {Record<string, {total:number, releases:number, docker:number, manual:number}>} */
  const projects = {};
  let githubReleases = 0;
  let dockerHub = 0;
  let manual = 0;
  for (const [index, repo] of repos.entries()) {
    const count = counts[index];
    projects[repo] = count;
    githubReleases += count.releases;
    dockerHub += count.docker;
    manual += count.manual;
  }

  return {
    total: githubReleases + dockerHub + manual,
    sources: { githubReleases, dockerHub, manual },
    manualVerifiedOn: MANUAL_COUNTS_VERIFIED_ON,
    projects,
  };
}

/**
 * Compact rendering of a download count, matching the CV metric badges
 * (`~138k`). Exact below 1,000, which only happens for figures we do not
 * display anyway.
 *
 * @param {number} count - The download count.
 * @returns {string} The compact figure.
 */
export function compactDownloads(count) {
  return count >= 1000 ? `~${Math.round(count / 1000)}k` : String(count);
}
