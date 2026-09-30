/**
 * The site-wide download total, as the /projects/ methodology states it.
 *
 * The home page's `~/whoami` card printed this figure as `downloads.total`,
 * and the methodology on /projects/ said the per-project numbers "do not add
 * up to the site-wide total" without ever giving it, so no sentence on the
 * site defined the figure (GEO audit #11, B11). The page and its markdown
 * twin now state it with the moment it was counted; both read it through
 * this function so they cannot disagree with each other or with the home
 * card, which reads the same `total`.
 *
 * A leaf on purpose, like `home-facts.ts`: it imports nothing, so the unit
 * test loads it directly.
 *
 * @module
 */

/** The total and when it was counted, both validated. */
export interface SiteDownloadsTotal {
  /** Every counted download across every project and channel. */
  readonly total: number;
  /** When `downloads.json` was generated, which is when it was counted. */
  readonly countedAt: Date;
}

/**
 * Reads the total out of `src/data/downloads.json`.
 *
 * Checked, not trusted, for the reason the hand-read date beside it is:
 * the file is generated and git-ignored, so a build host holds whatever its
 * last refresh left behind. A total of zero is how the home card says "no
 * data" (it prints a dash), and an unparseable `generatedAt` would throw in
 * `Intl.DateTimeFormat.format`; either way there is no sentence to write.
 *
 * @param data - The parsed `downloads.json`.
 * @param data.total - Its `total` field.
 * @param data.generatedAt - Its `generatedAt` field.
 * @returns The total and its date, or nothing.
 */
export function siteDownloadsTotal(data: {
  readonly total?: unknown;
  readonly generatedAt?: unknown;
}): SiteDownloadsTotal | undefined {
  const { total, generatedAt } = data;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total <= 0) {
    return undefined;
  }
  if (typeof generatedAt !== "string") return undefined;
  const countedAt = new Date(generatedAt);
  if (Number.isNaN(countedAt.getTime())) return undefined;
  return { total, countedAt };
}
