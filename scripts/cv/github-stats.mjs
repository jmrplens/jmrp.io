/**
 * GitHub repository stats for CV projects, fetched at build time so star /
 * release / download counts never need manual maintenance.
 *
 * Shared by the ATS generator (Node) and the website (Astro SSR build). Uses
 * `GITHUB_TOKEN` when present (higher rate limit). Results are cached per process.
 *
 * @module
 */

import process from "node:process";

import {
  DOWNLOAD_SOURCES,
  DOWNLOADS_DISPLAY_MIN,
  fetchDockerHubPulls,
} from "../download-sources.mjs";

const API = "https://api.github.com";
/** @type {Map<string, Promise<{stars:number, releases:number, downloads:number}>>} */
const cache = new Map();

/** Builds GitHub API request headers (with auth when a token is available). */
function ghHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "jmrp.io-cv",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Extracts the first `owner/repo` slug from a list of CV links.
 *
 * @param {{url?: string}[]} [links] - The project links.
 * @returns {string|null} The `owner/repo` slug, or null if none is a GitHub URL.
 */
export function githubSlug(links) {
  for (const link of links ?? []) {
    const m = /github\.com\/([^/]+\/[^/?#]+)/.exec(link.url ?? "");
    if (m) return m[1].replace(/\.git$/, "");
  }
  return null;
}

/**
 * Fetches star, release and combined-download counts for a repo (cached).
 * `downloads` covers every distribution channel of the project, not just
 * GitHub Releases.
 *
 * @param {string} slug - The `owner/repo` slug.
 * @returns {Promise<{stars:number, releases:number, downloads:number}>} The stats.
 */
export function fetchRepoStats(slug) {
  if (cache.has(slug)) return cache.get(slug);
  const promise = (async () => {
    try {
      const [repoRes, relRes] = await Promise.all([
        fetch(`${API}/repos/${slug}`, { headers: ghHeaders() }),
        fetch(`${API}/repos/${slug}/releases?per_page=100`, {
          headers: ghHeaders(),
        }),
      ]);
      if (!repoRes.ok) {
        throw new Error(`GitHub ${slug}: HTTP ${repoRes.status}`);
      }
      const repo = await repoRes.json();
      let releases = 0;
      let downloads = 0;
      if (relRes.ok) {
        const rels = await relRes.json();
        if (Array.isArray(rels)) {
          releases = rels.length;
          for (const rel of rels) {
            for (const asset of rel.assets ?? []) {
              downloads += asset.download_count ?? 0;
            }
          }
        }
      }
      // A project usually ships through more than one channel — the MCP
      // servers are on Docker Hub as well as in GitHub Releases — and the
      // badge has to state ONE number or it understates the project. The
      // channel map lives in `download-sources.mjs`, shared with the pre-build
      // step that computes the homepage total, so the CV and the homepage
      // cannot report the same project two different ways.
      const name = slug.split("/", 2)[1] ?? "";
      const channels = DOWNLOAD_SOURCES[name];
      const pulls = await Promise.all(
        (channels?.docker ?? []).map(fetchDockerHubPulls),
      );
      const extra =
        pulls.reduce((sum, n) => sum + n, 0) + (channels?.manual?.count ?? 0);

      return {
        stars: repo.stargazers_count ?? 0,
        releases,
        downloads: downloads + extra,
      };
    } catch (error) {
      // Don't cache failures so a later call can retry.
      cache.delete(slug);
      throw error;
    }
  })();
  cache.set(slug, promise);
  return promise;
}

/**
 * Formats repo stats as CV metric badges, localized. The download badge is
 * omitted below {@link DOWNLOADS_DISPLAY_MIN}.
 *
 * @param {{stars:number, releases:number, downloads:number}} stats - The stats.
 * @param {string} locale - "es" or "en".
 * @returns {string[]} Metric badge strings (e.g. ["27★", "35 releases", "~29k descargas"]).
 */
export function formatStats(stats, locale) {
  const out = [`${stats.stars}★`];
  if (stats.releases > 0) out.push(`${stats.releases} releases`);
  // Below the threshold the figure is not flattering — "104 downloads" next
  // to a project reads as a verdict on it. The project keeps contributing to
  // the site-wide total either way; what is suppressed is only its own badge.
  if (stats.downloads >= DOWNLOADS_DISPLAY_MIN) {
    const count = `~${Math.round(stats.downloads / 1000)}k`;
    out.push(`${count} ${locale === "es" ? "descargas" : "downloads"}`);
  }
  return out;
}
