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
  /**
   * `id` in `projects.yaml` of the program the series documents. Set only for
   * a series about one program: its hub then says `about` that program's
   * `#software` node rather than the author, its posts `mention` it, and the
   * project's card on /projects/ links back to the series.
   *
   * A project id rather than a hand-written `@id`, so the series and the
   * project's own node take their `@id` from the same rule
   * (`seriesSoftwareId` in `@utils/projects`, through
   * `scripts/utils/software-id.mjs`), which also covers a project with no
   * public repository. Resolved there because this module must stay free of
   * `astro:content`: the sitemap integration imports it from the Astro config.
   */
  project?: string;
}

/** The curated series. Order within `posts` is the reading order, not the date. */
export const SERIES: Series[] = [
  { slug: "nginx-hardening", posts: ["001", "003", "004", "002", "005"] },
  { slug: "mikrotik-dual-stack", posts: ["007", "008", "006"] },
  {
    slug: "kleidos-firmware",
    posts: ["010", "011", "012"],
    project: "kleidos",
  },
  {
    slug: "gitlab-mcp-server",
    posts: ["013", "014"],
    project: "gitlab-mcp-server",
  },
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
 * The series about a given project, so its card can point at it.
 *
 * Matched by project id, not by repository URL: a project still in
 * development has no public repository to match on, and the id is what the
 * series names anyway.
 *
 * @param projectId - The project's `id` in `projects.yaml`.
 * @returns The series that documents that project, if any.
 */
export function getSeriesForProject(projectId: string): Series | undefined {
  return SERIES.find((series) => series.project === projectId);
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
