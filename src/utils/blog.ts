import type { CollectionEntry } from "astro:content";

/**
 * Processes a collection of blog posts to extract all unique tags and their occurrence counts.
 */
export function getUniqueTags(posts: CollectionEntry<"posts">[]) {
  const tags = posts
    .flatMap((post) => post.data.tags)
    .filter((tag): tag is string => tag !== undefined)
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
