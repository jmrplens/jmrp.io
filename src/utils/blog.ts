import type { CollectionEntry } from "astro:content";

/**
 * Processes a collection of blog posts to extract all unique tags and their occurrence counts.
 *
 * @param {CollectionEntry<"posts">[]} posts - Array of blog post entries.
 * @returns {Array<{ tag: string; count: number }>} Sorted array of objects containing the tag name and its frequency, from most to least frequent.
 */
export function getUniqueTags(posts: CollectionEntry<"posts">[]) {
  const tags = posts
    .flatMap((post) => post.data.tags)
    .filter((tag): tag is string => tag !== undefined);

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
