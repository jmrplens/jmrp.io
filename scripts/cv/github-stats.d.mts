/** Type declarations for github-stats.mjs. */
export function githubSlug(links?: { url?: string }[]): string | null;
export function fetchRepoStats(
  slug: string,
): Promise<{ stars: number; releases: number; downloads: number }>;
export function formatStats(
  stats: { stars: number; releases: number; downloads: number },
  locale: string,
): string[];
