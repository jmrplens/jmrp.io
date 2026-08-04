import { defaultLocale, type Locale } from "@i18n/config";
import type { CollectionEntry } from "astro:content";
import { getCollection } from "astro:content";

/** A post entry paired with a flag indicating whether it is a fallback (untranslated). */
export interface LocalizedPost {
  /** The resolved post collection entry. */
  post: CollectionEntry<"posts">;
  /** `true` when no translation exists for the requested locale and the EN version is served. */
  isFallback: boolean;
}

/**
 * Returns published posts for a given locale with automatic EN fallback.
 *
 * - For the default locale: returns only posts with `lang === defaultLocale`.
 * - For other locales: returns locale-specific posts, plus any EN posts
 *   that have no translation yet (marked as `isFallback: true`).
 *
 * Results are sorted newest-first by `publishedDate`.
 *
 * @param locale - The target locale.
 * @returns Array of localized posts, sorted by date descending.
 */
export async function getPostsForLocale(
  locale: Locale,
): Promise<LocalizedPost[]> {
  const allPosts = await getCollection("posts", ({ data }) => !data.draft);
  const enPosts = allPosts.filter((p) => p.data.lang === defaultLocale);

  if (locale === defaultLocale) {
    return enPosts
      .toSorted(
        (a, b) =>
          b.data.publishedDate.valueOf() - a.data.publishedDate.valueOf(),
      )
      .map((post) => ({ post, isFallback: false }));
  }

  const localePosts = allPosts.filter((p) => p.data.lang === locale);
  const localeSlugs = new Set(localePosts.map((p) => p.data.slug));

  const entries: LocalizedPost[] = [
    ...localePosts.map((post) => ({ post, isFallback: false })),
    ...enPosts
      .filter((p) => !localeSlugs.has(p.data.slug))
      .map((post) => ({ post, isFallback: true })),
  ];

  return entries.toSorted(
    (a, b) =>
      b.post.data.publishedDate.valueOf() - a.post.data.publishedDate.valueOf(),
  );
}

/**
 * Formats a date as the site's canonical compact "YYYY·MM·DD" string
 * (middle-dot separator, U+00B7). Used across the blog listing, the home
 * "latest notes" list and the post header so dates read consistently.
 *
 * @param input - A Date (or date string).
 * @returns The date as `YYYY·MM·DD`.
 */
export function formatDateDot(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return `${d.getFullYear()}·${String(d.getMonth() + 1).padStart(2, "0")}·${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Estimates reading time in whole minutes from a post's raw body.
 *
 * Uses a 200-words-per-minute baseline (a common prose reading speed) and never
 * returns less than 1 minute. Markdown/MDX syntax is counted as words, which
 * slightly over-counts, but the figure is a rough reader-facing hint.
 *
 * @param post - The post collection entry.
 * @returns Estimated reading time in minutes (≥ 1).
 */
export function getReadingTime(post: CollectionEntry<"posts">): number {
  const words = post.body?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  return Math.max(1, Math.round(words / 200));
}

/**
 * URL segment for a tag page link. Encodes anything unsafe for a path segment
 * but keeps `+` literal: in a path, `+` is a legal literal character (it only
 * means "space" inside query strings), so `c++` links as /blog/tags/c++/
 * instead of the uglier /blog/tags/c%2B%2B/. Both forms resolve to the same
 * page; this keeps every generator on the pretty canonical form.
 */
export function tagUrlSegment(tag: string): string {
  return encodeURIComponent(tag.toLowerCase()).replaceAll("%2B", "+");
}

/**
 * Processes a collection of blog posts to extract all unique tags and their occurrence counts.
 */
export function getUniqueTags(posts: CollectionEntry<"posts">[]) {
  const tags = posts
    .flatMap((post) => post.data.tags)
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.toLowerCase());

  const tagCounts = tags.reduce(
    (acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}
