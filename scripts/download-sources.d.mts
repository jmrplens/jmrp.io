/** Type declarations for download-sources.mjs. */

/** Download counts of one project, split by distribution channel. */
export interface ProjectDownloads {
  /** Every channel combined — the figure shown next to the project. */
  total: number;
  /** Cumulative GitHub release-asset downloads. */
  releases: number;
  /** Cumulative Docker Hub pulls. */
  docker: number;
  /** Hand-read counts from channels that refuse scripted requests. */
  manual: number;
}

/** Per-project distribution channels, keyed by GitHub repository name. */
export const DOWNLOAD_SOURCES: Record<
  string,
  {
    releases: boolean;
    docker: string[];
    manual?: { source: string; count: number };
  }
>;

/** Date the hand-read `manual` counts were last verified (ISO date). */
export const MANUAL_COUNTS_VERIFIED_ON: string;

/** GitHub account that owns every configured project. */
export const OWNER: string;

/** Minimum count before a project's own download figure is displayed. */
export const DOWNLOADS_DISPLAY_MIN: number;

/**
 * Sums `download_count` across every release asset of a repo.
 *
 * @param repo - Repository name under the owner account.
 * @param token - GitHub token; falls back to the environment.
 * @returns Total asset downloads for the repo.
 */
export function fetchReleaseDownloads(
  repo: string,
  token?: string,
): Promise<number>;

/**
 * Reads the cumulative `pull_count` of a single Docker Hub image.
 *
 * @param slug - `namespace/repository` slug.
 * @returns The image's pull count.
 */
export function fetchDockerHubPulls(slug: string): Promise<number>;

/**
 * Combined download count of one project across every channel (cached).
 *
 * @param repo - Repository name under the owner account.
 * @param token - GitHub token; falls back to the environment.
 * @returns Counts per channel.
 */
export function fetchProjectDownloads(
  repo: string,
  token?: string,
): Promise<ProjectDownloads>;

/**
 * Fetches every configured project at once and aggregates the grand total.
 *
 * @param token - GitHub token; falls back to the environment.
 * @returns The full breakdown.
 */
export function fetchAllDownloads(token?: string): Promise<{
  total: number;
  sources: { githubReleases: number; dockerHub: number; manual: number };
  manualVerifiedOn: string;
  projects: Record<string, ProjectDownloads>;
}>;

/**
 * Compact rendering of a download count (`~138k`).
 *
 * @param count - The download count.
 * @returns The compact figure.
 */
export function compactDownloads(count: number): string;
