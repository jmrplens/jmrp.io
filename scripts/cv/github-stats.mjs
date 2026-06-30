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
 * Fetches star, release and total-download counts for a repo (cached).
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
      return { stars: repo.stargazers_count ?? 0, releases, downloads };
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
 * Formats repo stats as CV metric badges, localized.
 *
 * @param {{stars:number, releases:number, downloads:number}} stats - The stats.
 * @param {string} locale - "es" or "en".
 * @returns {string[]} Metric badge strings (e.g. ["27★", "35 releases", "~29k descargas"]).
 */
export function formatStats(stats, locale) {
  const out = [`${stats.stars}★`];
  if (stats.releases > 0) out.push(`${stats.releases} releases`);
  if (stats.downloads > 0) {
    const count =
      stats.downloads >= 1000
        ? `~${Math.round(stats.downloads / 1000)}k`
        : String(stats.downloads);
    out.push(`${count} ${locale === "es" ? "descargas" : "downloads"}`);
  }
  return out;
}
