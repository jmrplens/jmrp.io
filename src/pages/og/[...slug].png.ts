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
 * Slug mapping mirrors how `BaseHead.astro` computes the per-route path
 * (the full pathname, locale INCLUDED):
 *   /            → `home`
 *   /blog/       → `blog`
 *   /blog/001-x/ → `blog/001-x`
 *   /es/         → `es`
 *   /es/blog/    → `es/blog`
 *   /es/blog/001-x/ → `es/blog/001-x`
 *
 * Both locales are generated: the site is fully bilingual, so each ES card
 * carries the post/tool/page title in Spanish.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { getUniqueTags } from "@utils/blog";
import { generateOgImage } from "@utils/og-image";
import type { APIContext } from "astro";
import { getCollection } from "astro:content";

interface OgProps {
  /** Large heading displayed in Space Grotesk 700. */
  title: string;
  /** Optional muted subtitle in IBM Plex Mono. */
  subtitle?: string;
  /** Optional raw cover-image bytes, cropped into the card's right panel. */
  cover?: Buffer;
}

// Map every blog cover's processed `.src` (hashed path, identical to the value
// a post's `coverImage.src` resolves to) back to its on-disk source file, so we
// can read the raw bytes at build time and feed them to the OG generator.
const coverModules = import.meta.glob<{ src: string }>(
  "/src/assets/images/blog/*.{webp,png,jpg,jpeg,avif}",
  { eager: true, import: "default" },
);
const coverPathBySrc = new Map<string, string>();
for (const key in coverModules) {
  coverPathBySrc.set(coverModules[key].src, path.join(process.cwd(), key));
}

/**
 * Reads a post cover's raw bytes from disk given its processed ImageMetadata.
 * Returns undefined when the post has no cover or the source can't be resolved.
 * @param coverImage - The post's `coverImage` ImageMetadata (or undefined).
 */
function readCover(coverImage?: { src: string }): Buffer | undefined {
  if (!coverImage) return undefined;
  const src = coverPathBySrc.get(coverImage.src);
  return src ? readFileSync(src) : undefined;
}

type Locale = "en" | "es";
const LOCALES: Locale[] = ["en", "es"];

/** Tool category display names used in OG subtitles, per locale. */
const CATEGORY_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    security: "Security Tools",
    developer: "Developer Tools",
    network: "Network Tools",
    embedded: "Embedded Tools",
    mikrotik: "MikroTik Tools",
  },
  es: {
    security: "Herramientas de seguridad",
    developer: "Herramientas de desarrollo",
    network: "Herramientas de red",
    embedded: "Herramientas embebidas",
    mikrotik: "Herramientas MikroTik",
  },
};

/** Bespoke OG copy for the static (non-collection) pages, per locale. */
const STATIC_PAGES: Record<string, Record<Locale, OgProps>> = {
  home: {
    en: {
      title: "José M. Requena Plens",
      subtitle: "R&D Engineer · Embedded Systems & IoT",
    },
    es: {
      title: "José M. Requena Plens",
      subtitle: "Ingeniero de I+D · Sistemas embebidos e IoT",
    },
  },
  blog: {
    en: { title: "Blog", subtitle: "Engineering notes & technical articles" },
    es: { title: "Blog", subtitle: "Notas de ingeniería y artículos técnicos" },
  },
  tools: {
    en: {
      title: "Developer Tools",
      subtitle: "Interactive browser-based utilities · jmrp.io",
    },
    es: {
      title: "Herramientas para desarrolladores",
      subtitle: "Utilidades interactivas en el navegador · jmrp.io",
    },
  },
  cv: {
    en: {
      title: "Curriculum Vitae",
      subtitle: "José M. Requena Plens · R&D Engineer",
    },
    es: {
      title: "Currículum",
      subtitle: "José M. Requena Plens · Ingeniero de I+D",
    },
  },
  projects: {
    en: {
      title: "Projects",
      subtitle: "Open source software I build & maintain · jmrp.io",
    },
    es: {
      title: "Proyectos",
      subtitle: "Software open source que construyo y mantengo · jmrp.io",
    },
  },
  homelab: {
    en: {
      title: "Homelab",
      subtitle: "Self-hosted infrastructure & services · jmrp.io",
    },
    es: {
      title: "Homelab",
      subtitle: "Infraestructura y servicios autoalojados · jmrp.io",
    },
  },
  publications: {
    en: {
      title: "Publications",
      subtitle: "Academic & research papers · jmrp.io",
    },
    es: {
      title: "Publicaciones",
      subtitle: "Artículos académicos y de investigación · jmrp.io",
    },
  },
  // Non-indexed pages still get a card so they don't 404 on scraping.
  "404": {
    en: { title: "Page Not Found", subtitle: "jmrp.io" },
    es: { title: "Página no encontrada", subtitle: "jmrp.io" },
  },
};

/** Localized "Blog" kicker for post + tag cards. */
const BLOG_KICKER: Record<Locale, string> = {
  en: "Blog · jmrp.io",
  es: "Blog · jmrp.io",
};

/** Localized kicker for tool category cards. */
const TOOLS_KICKER: Record<Locale, string> = {
  en: "Interactive browser-based utilities · jmrp.io",
  es: "Utilidades interactivas en el navegador · jmrp.io",
};

/**
 * Maps a locale + EN-canonical slug to the OG image path segment. ES mirrors
 * the page URL (`/es/…`) so BaseHead — which no longer strips the locale — finds
 * the matching translated card. The ES home lives at `es` (page URL `/es/`).
 * @param locale - Target locale.
 * @param base - EN canonical slug (e.g. "home", "blog/010-x", "tools/csp-builder").
 */
function ogSlug(locale: Locale, base: string): string {
  if (locale === "en") return base;
  return base === "home" ? "es" : `es/${base}`;
}

/**
 * Truncates a tool description so satori keeps it on the single subtitle line.
 * @param description - Full tool description.
 */
function toolSubtitle(description: string): string {
  return description.length > 72 ? `${description.slice(0, 69)}…` : description;
}

/**
 * Enumerates every route — in BOTH locales — that needs a per-route OG image.
 * Post/tool titles come from each locale's collection entry (fully translated);
 * static-page copy comes from STATIC_PAGES. Returns static-path entries with
 * { title, subtitle, cover? } props consumed by GET.
 */
export async function getStaticPaths() {
  const [postsByLocale, toolsByLocale] = await Promise.all([
    Promise.all(
      LOCALES.map((locale) =>
        getCollection(
          "posts",
          ({ data }) => !data.draft && data.lang === locale,
        ),
      ),
    ),
    Promise.all(
      LOCALES.map((locale) =>
        getCollection("tools", ({ data }) => data.lang === locale),
      ),
    ),
  ]);

  const entries: { params: { slug: string }; props: OgProps }[] = [];

  LOCALES.forEach((locale, index) => {
    const posts = postsByLocale[index];
    const tools = toolsByLocale[index];
    const tags = getUniqueTags(posts).map(({ tag }) => tag);
    const categories = [
      ...new Set(tools.map((t) => t.data.category as string)),
    ];

    // ── Static pages ──────────────────────────────────────────────────────
    for (const [base, copy] of Object.entries(STATIC_PAGES)) {
      entries.push({
        params: { slug: ogSlug(locale, base) },
        props: copy[locale],
      });
    }

    // ── Blog posts (cover art as background) ──────────────────────────────
    for (const post of posts) {
      entries.push({
        params: { slug: ogSlug(locale, `blog/${post.data.slug}`) },
        props: {
          title: post.data.title,
          subtitle: BLOG_KICKER[locale],
          cover: readCover(post.data.coverImage),
        },
      });
    }

    // ── Blog tag pages ────────────────────────────────────────────────────
    for (const tag of tags) {
      entries.push({
        params: { slug: ogSlug(locale, `blog/tags/${tag}`) },
        props: { title: `#${tag}`, subtitle: BLOG_KICKER[locale] },
      });
    }

    // ── Tool pages ────────────────────────────────────────────────────────
    for (const tool of tools) {
      entries.push({
        params: { slug: ogSlug(locale, `tools/${tool.data.slug}`) },
        props: {
          title: tool.data.title,
          subtitle: toolSubtitle(tool.data.description),
        },
      });
    }

    // ── Tool category pages ───────────────────────────────────────────────
    for (const category of categories) {
      entries.push({
        params: { slug: ogSlug(locale, `tools/categories/${category}`) },
        props: {
          title: CATEGORY_LABELS[locale][category] ?? category,
          subtitle: TOOLS_KICKER[locale],
        },
      });
    }
  });

  return entries;
}

/**
 * Handles a single OG image request at build time.
 * Returns the generated PNG as a binary HTTP response.
 */
export async function GET({ props }: APIContext<OgProps>): Promise<Response> {
  const png = await generateOgImage(props.title, props.subtitle, props.cover);
  // Convert Node.js Buffer to Uint8Array so TypeScript resolves to BodyInit.
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
