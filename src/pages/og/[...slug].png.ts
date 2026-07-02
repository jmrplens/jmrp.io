/**
 * Per-route Open Graph image endpoint.
 *
 * Generates 1200×630 branded PNG images at build time via `getStaticPaths()`.
 * Each image shows:
 *  - the Lab hairline grid on #0A0A0B
 *  - the `❯ jmrp_` logo mark (teal / amber)
 *  - the page title in Space Grotesk 700
 *  - an optional subtitle in IBM Plex Mono
 *  - "jmrp.io" domain label
 *
 * Slug mapping mirrors how `BaseHead.astro` computes the per-route path:
 *   /           → `home`
 *   /blog/      → `blog`
 *   /blog/001-x/→ `blog/001-x`
 *   /tools/csp/ → `tools/csp-builder`
 *   /es/blog/   → (same as /blog/, locale stripped in BaseHead)
 *
 * Only EN slugs are generated; ES pages reference the same image file since
 * OG images are locale-agnostic for this project.
 */

import { getUniqueTags } from "@utils/blog";
import { generateOgImage } from "@utils/og-image";
import type { APIContext } from "astro";
import { getCollection } from "astro:content";

interface OgProps {
  /** Large heading displayed in Space Grotesk 700. */
  title: string;
  /** Optional muted subtitle in IBM Plex Mono. */
  subtitle?: string;
}

/** Tool category display names used in OG subtitles. */
const CATEGORY_LABELS: Record<string, string> = {
  security: "Security Tools",
  developer: "Developer Tools",
  network: "Network Tools",
  embedded: "Embedded Tools",
  mikrotik: "MikroTik Tools",
};

/**
 * Enumerates all routes that need a per-route OG image.
 * Returns static-path entries with { title, subtitle } props consumed by GET.
 */
export async function getStaticPaths() {
  const [posts, tools] = await Promise.all([
    // Only published EN posts (ES uses the same slug-based OG image)
    getCollection("posts", ({ data }) => !data.draft && data.lang === "en"),
    // Only EN tools — ES entries share the same data.slug and would produce
    // duplicate static paths, causing a PrerenderRouteConflict error.
    getCollection("tools", ({ data }) => data.lang === "en"),
  ]);

  // ── Unique tags across all published posts ──────────────────────────────
  const tags = getUniqueTags(posts).map(({ tag }) => tag);

  // ── Tool categories ─────────────────────────────────────────────────────
  const categories = [...new Set(tools.map((t) => t.data.category as string))];

  return [
    // ── Static pages ──────────────────────────────────────────────────────
    {
      params: { slug: "home" },
      props: {
        title: "José M. Requena Plens",
        subtitle: "R&D Engineer · Embedded Systems & IoT",
      } satisfies OgProps,
    },
    {
      params: { slug: "blog" },
      props: {
        title: "Blog",
        subtitle: "Engineering notes & technical articles",
      } satisfies OgProps,
    },
    {
      params: { slug: "tools" },
      props: {
        title: "Developer Tools",
        subtitle: "Interactive browser-based utilities · jmrp.io",
      } satisfies OgProps,
    },
    {
      params: { slug: "cv" },
      props: {
        title: "Curriculum Vitae",
        subtitle: "José M. Requena Plens · R&D Engineer",
      } satisfies OgProps,
    },
    {
      params: { slug: "github" },
      props: {
        title: "GitHub Repositories",
        subtitle: "Open source contributions · jmrp.io",
      } satisfies OgProps,
    },
    {
      params: { slug: "homelab" },
      props: {
        title: "Homelab",
        subtitle: "Self-hosted infrastructure & services · jmrp.io",
      } satisfies OgProps,
    },
    {
      params: { slug: "publications" },
      props: {
        title: "Publications",
        subtitle: "Academic & research papers · jmrp.io",
      } satisfies OgProps,
    },
    // Non-indexed pages still get a card so they don't 404 on scraping
    {
      params: { slug: "404" },
      props: {
        title: "Page Not Found",
        subtitle: "jmrp.io",
      } satisfies OgProps,
    },

    // ── Blog posts ────────────────────────────────────────────────────────
    ...posts.map((post) => ({
      params: { slug: `blog/${post.data.slug}` },
      props: {
        title: post.data.title,
        subtitle: "Blog · jmrp.io",
      } satisfies OgProps,
    })),

    // ── Blog tag pages ────────────────────────────────────────────────────
    ...tags.map((tag) => ({
      params: { slug: `blog/tags/${tag}` },
      props: {
        title: `#${tag}`,
        subtitle: "Blog · jmrp.io",
      } satisfies OgProps,
    })),

    // ── Tool pages ────────────────────────────────────────────────────────
    ...tools.map((tool) => ({
      params: { slug: `tools/${tool.data.slug}` },
      props: {
        title: tool.data.title,
        // Description truncated: satori wraps at ~80 chars at 18px mono
        subtitle:
          tool.data.description.length > 72
            ? `${tool.data.description.slice(0, 69)}…`
            : tool.data.description,
      } satisfies OgProps,
    })),

    // ── Tool category pages ───────────────────────────────────────────────
    ...categories.map((category) => ({
      params: { slug: `tools/categories/${category}` },
      props: {
        title: CATEGORY_LABELS[category] ?? `${category} Tools`,
        subtitle: "Interactive browser-based utilities · jmrp.io",
      } satisfies OgProps,
    })),
  ];
}

/**
 * Handles a single OG image request at build time.
 * Returns the generated PNG as a binary HTTP response.
 */
export async function GET({ props }: APIContext<OgProps>): Promise<Response> {
  const png = await generateOgImage(props.title, props.subtitle);
  // Convert Node.js Buffer to Uint8Array so TypeScript resolves to BodyInit.
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
