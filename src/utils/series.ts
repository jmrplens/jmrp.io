import type { CollectionEntry } from "astro:content";

/**
 * Editorial series — hand-curated topic hubs.
 *
 * These exist because tag pages are listings, not arguments: they cannot
 * explain why three posts belong together or in what order to read them.
 * A series page carries original framing (why the cluster exists, what each
 * piece decides) and links the member articles as an ordered `ItemList`.
 */
export interface Series {
  /** URL segment and i18n key suffix — copy lives under `series.<slug>.*`. */
  slug: string;
  /**
   * Member posts in reading order, identified by the numeric filename prefix
   * shared by the EN and ES versions of the same article.
   */
  posts: string[];
}

/** The curated series. Order within `posts` is the reading order, not the date. */
export const SERIES: Series[] = [
  { slug: "nginx-hardening", posts: ["001", "003", "004", "002", "005"] },
  { slug: "mikrotik-dual-stack", posts: ["007", "008", "006"] },
  { slug: "kleidos-firmware", posts: ["010", "011", "012"] },
];

/**
 * Look up a series by slug.
 *
 * @param slug - The series URL segment.
 * @returns The series definition, or `undefined` when unknown.
 */
export function getSeries(slug: string): Series | undefined {
  return SERIES.find((series) => series.slug === slug);
}

/**
 * Resolve a series' member posts, in the curated reading order.
 *
 * Posts are matched by the `NNN-` numeric prefix so one definition serves both
 * locales; a prefix with no published post in the given list is skipped rather
 * than rendering a dead entry.
 *
 * @param series - The series definition.
 * @param posts - Candidate posts (already locale-filtered).
 * @returns The member posts, ordered.
 */
export function getSeriesPosts(
  series: Series,
  posts: CollectionEntry<"posts">[],
): CollectionEntry<"posts">[] {
  return series.posts
    .map((prefix) =>
      posts.find((post) => post.data.slug.startsWith(`${prefix}-`)),
    )
    .filter((post): post is CollectionEntry<"posts"> => Boolean(post));
}

/**
 * The series a post belongs to, and its position within it.
 *
 * The inverse of {@link getSeriesPosts}, and the reason it exists: the hubs
 * linked down to their members but nothing linked back up, so a reader arriving
 * at part 2 straight from a search result had no way to learn there were four
 * more parts or which one came first. The data to say so was already here.
 *
 * @param prefix - The post's `NNN` filename prefix.
 * @returns The owning series with a 1-based position and the member count, or
 *   undefined for posts that are deliberately standalone.
 */
export function getSeriesForPost(
  prefix: string,
): { series: Series; position: number; total: number } | undefined {
  for (const series of SERIES) {
    const index = series.posts.indexOf(prefix);
    if (index !== -1) {
      return { series, position: index + 1, total: series.posts.length };
    }
  }
  return undefined;
}
