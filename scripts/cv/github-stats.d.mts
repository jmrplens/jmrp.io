/** Type declarations for github-stats.mjs. */

/**
 * Extracts the first `owner/repo` slug from a list of CV links.
 *
 * @param links - The project links.
 * @returns The `owner/repo` slug, or null if none is a GitHub URL.
 */
export function githubSlug(links?: { url?: string }[]): string | null;

/**
 * Fetches star, release and total-download counts for a repo (cached).
 *
 * @param slug - The `owner/repo` slug.
 * @returns The repository stats.
 */
export function fetchRepoStats(
  slug: string,
): Promise<{ stars: number; releases: number; downloads: number }>;

/**
 * Formats repo stats as CV metric badges, localized.
 *
 * @param stats - The repository stats.
 * @param locale - "es" or "en".
 * @returns Metric badge strings (e.g. ["27★", "35 releases", "~29k downloads"]).
 */
export function formatStats(
  stats: { stars: number; releases: number; downloads: number },
  locale: string,
): string[];

/**
 * The repository root: `JMRP_REPO_ROOT` when set, else the nearest directory
 * at or above `start` that holds `scripts/download-sources.mjs`.
 *
 * @param start - Where to start looking; defaults to the working directory.
 * @param env - Environment, for the override.
 * @returns The repository root, or `start` when none is found.
 */
export function findRepoRoot(start?: string, env?: NodeJS.ProcessEnv): string;
