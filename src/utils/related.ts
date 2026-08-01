import { defaultLocale, type Locale } from "@i18n/config";
import { getCollection } from "astro:content";

/**
 * Hand-curated topical relations between posts and tools, keyed by the
 * numeric slug prefix so the map survives slug renames.
 *
 * Tag-derived relations were rejected: 20 of 28 tags hold exactly one post,
 * so tag overlap carries almost no signal. These pairs encode the actual
 * editorial clusters (Nginx TLS stack, CrowdSec-backed defence, MikroTik
 * dual-stack, Kleidos firmware trilogy).
 */
export const RELATED: Record<string, { posts: string[]; tools: string[] }> = {
  "001": { posts: ["003", "004"], tools: ["cert-inspector"] },
  "002": { posts: ["005", "004"], tools: ["nginx-config-generator"] },
  "003": { posts: ["001", "004"], tools: ["csp-builder", "hash-calculator"] },
  "004": {
    posts: ["001", "003"],
    tools: ["nginx-config-generator", "http-headers-analyzer"],
  },
  "005": { posts: ["006", "009"], tools: ["nginx-config-generator"] },
  "006": { posts: ["005", "009"], tools: ["subnet-calculator"] },
  "007": { posts: ["008", "006"], tools: ["wireguard-config-generator"] },
  "008": { posts: ["007", "006"], tools: ["subnet-calculator"] },
  "009": { posts: ["005", "006"], tools: ["nginx-config-generator"] },
  "010": { posts: ["011", "012"], tools: ["string-pool-packer"] },
  "011": { posts: ["012", "010"], tools: ["etm-envelope-visualizer"] },
  "012": { posts: ["011", "010"], tools: ["pin-brute-force-calculator"] },
};

/** A resolved related item, ready to render as a link. */
export interface RelatedEntry {
  /** The entry's full slug (post) or collection slug (tool). */
  slug: string;
  /** The entry's title in the resolved locale. */
  title: string;
}

/** Locale-resolved related posts and tools for one post. */
export interface RelatedContent {
  posts: RelatedEntry[];
  tools: RelatedEntry[];
}

/**
 * Resolves the curated relations for one post into locale-aware slug+title
 * pairs, ready for `RelatedContent.astro`.
 *
 * Falls back to the English entry when a post or tool has no translation yet
 * in the requested locale — the same fallback pattern used by
 * `getPostsForLocale()`/`getToolsForLocale()`.
 *
 * @param postNumber - The post's numeric slug prefix (e.g. "005").
 * @param locale - Locale to resolve titles/slugs in.
 * @returns The resolved related posts and tools; empty arrays when the post
 *   has no curated entry.
 */
export async function getRelatedContent(
  postNumber: string,
  locale: Locale,
): Promise<RelatedContent> {
  const relation = RELATED[postNumber];
  if (!relation) return { posts: [], tools: [] };

  const allPosts = await getCollection("posts", ({ data }) => !data.draft);
  const allTools = await getCollection("tools");

  const resolvePost = (n: string): RelatedEntry | undefined => {
    const candidates = allPosts.filter((p) => p.data.slug.startsWith(`${n}-`));
    const entry =
      candidates.find((p) => p.data.lang === locale) ??
      candidates.find((p) => p.data.lang === defaultLocale);
    return entry
      ? { slug: entry.data.slug, title: entry.data.title }
      : undefined;
  };

  const resolveTool = (slug: string): RelatedEntry | undefined => {
    const candidates = allTools.filter((t) => t.data.slug === slug);
    const entry =
      candidates.find((t) => t.data.lang === locale) ??
      candidates.find((t) => t.data.lang === defaultLocale);
    return entry
      ? { slug: entry.data.slug, title: entry.data.title }
      : undefined;
  };

  return {
    posts: relation.posts
      .map((n) => resolvePost(n))
      .filter((p): p is RelatedEntry => Boolean(p)),
    tools: relation.tools
      .map((s) => resolveTool(s))
      .filter((t): t is RelatedEntry => Boolean(t)),
  };
}
