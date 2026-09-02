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

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { defaultLocale } from "@i18n/config";
import type { TranslationKey } from "@i18n/utils";
import { useTranslations } from "@i18n/utils";
import { getPostsForLocale, getUniqueTags } from "@utils/blog";
import { generateOgImage } from "@utils/og-image";
import { SERIES } from "@utils/series";
import { getToolsForLocale } from "@utils/tools";
import type { APIContext } from "astro";

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
  about: {
    en: {
      title: "About",
      subtitle: "José M. Requena Plens · R&D Engineer",
    },
    es: {
      title: "Perfil",
      subtitle: "José M. Requena Plens · Ingeniero de I+D",
    },
  },
  uses: {
    en: {
      title: "Uses",
      subtitle: "Hardware, software & homelab in rotation · jmrp.io",
    },
    es: {
      title: "Uses",
      subtitle: "Hardware, software y homelab en rotación · jmrp.io",
    },
  },
  privacy: {
    en: {
      title: "Privacy",
      subtitle: "Self-hosted analytics, no cookies, no trackers · jmrp.io",
    },
    es: {
      title: "Privacidad",
      subtitle: "Analítica autoalojada, sin cookies ni rastreadores · jmrp.io",
    },
  },
  license: {
    en: {
      title: "License",
      subtitle: "Writing & covers CC BY 4.0, source MIT · jmrp.io",
    },
    es: {
      title: "Licencia",
      subtitle: "Textos y portadas CC BY 4.0, código MIT · jmrp.io",
    },
  },
  feeds: {
    en: {
      title: "Feeds",
      subtitle: "RSS for the English and Spanish blogs · jmrp.io",
    },
    es: {
      title: "Feeds",
      subtitle: "RSS de los blogs en español e inglés · jmrp.io",
    },
  },
  "blog/series": {
    en: { title: "Series", subtitle: "Curated reading paths · jmrp.io" },
    es: { title: "Series", subtitle: "Itinerarios de lectura · jmrp.io" },
  },
  // Non-indexed pages still get a card so they don't 404 on scraping.
  "404": {
    en: { title: "Page Not Found", subtitle: "jmrp.io" },
    es: { title: "Página no encontrada", subtitle: "jmrp.io" },
  },
};

/**
 * Page files whose OG cards are enumerated in `getStaticPaths()` through the
 * SAME `getPostsForLocale` / `getToolsForLocale` helpers the page routes use,
 * so page and card cannot drift apart.
 *
 * Listed by name rather than pattern-matched on `[`, so a NEW dynamic route
 * family trips the coverage check below instead of being waved through.
 * Paths are relative to `src/pages`, with any `<locale>/` prefix removed.
 */
const COLLECTION_ROUTES = new Set([
  "blog/[...slug].astro",
  "blog/series/[series].astro",
  "blog/tags/[tag].astro",
  "tools/[...slug].astro",
  "tools/categories/[category].astro",
]);

/**
 * Maps a page file to the `STATIC_PAGES` key that `BaseHead.astro` derives from
 * that page's URL: `index.astro` → `home`, `blog/index.astro` → `blog`,
 * `about.astro` → `about`.
 * @param route - Page path relative to `src/pages`, with no locale prefix.
 * @returns The `STATIC_PAGES` key for that page.
 */
function staticPageKey(route: string): string {
  const withoutExtension = route.slice(0, -".astro".length);
  if (withoutExtension === "index") return "home";
  return withoutExtension.endsWith("/index")
    ? withoutExtension.slice(0, -"/index".length)
    : withoutExtension;
}

/**
 * Fails the build when `STATIC_PAGES` and the `.astro` pages on disk disagree.
 *
 * `BaseHead.astro` points `og:image` AND `twitter:image` at `/og/<pathname>.png`
 * unconditionally whenever no `image` prop is passed — it never checks that the
 * card exists, despite the comment there claiming it falls through to the
 * default image. So a page missing from `STATIC_PAGES` ships two meta tags that
 * 404, silently, in both locales: that is how `/license/` and `/es/license/`
 * went live with a dead preview image (GEO audit #6, M1).
 *
 * The locale axis comes from `LOCALES`, but note `ogSlug()` above still spells
 * the `es/` prefix out by hand: adding a third locale needs both updated.
 *
 * Throwing here fails `astro build` BEFORE `deploy-swap.mjs swap` retargets the
 * `dist` symlink, so a build with a dead card never becomes the live one.
 * @throws When a page has no card, a card has no page, an unlisted dynamic
 * route appears, or a page exists in only some locales.
 */
function assertStaticPagesCoverage(): void {
  const pagesDirectory = path.join(process.cwd(), "src/pages");
  const onDisk = new Map<Locale, Set<string>>(
    LOCALES.map((locale) => [locale, new Set<string>()]),
  );
  const prefixes = LOCALES.filter((locale) => locale !== defaultLocale).map(
    (locale) => ({ prefix: `${locale}/`, locale }),
  );

  for (const entry of readdirSync(pagesDirectory, {
    recursive: true,
    encoding: "utf8",
  })) {
    const route = entry.replaceAll(path.sep, "/");
    if (!route.endsWith(".astro")) continue;

    const match = prefixes.find((p) => route.startsWith(p.prefix));
    const locale = match ? match.locale : defaultLocale;
    const bare = match ? route.slice(match.prefix.length) : route;

    if (COLLECTION_ROUTES.has(bare)) continue;
    if (bare.includes("["))
      throw new Error(
        `og: unknown dynamic route src/pages/${route} — enumerate its cards in ` +
          "getStaticPaths() and list the file in COLLECTION_ROUTES.",
      );
    onDisk.get(locale)?.add(staticPageKey(bare));
  }

  const declared = new Set(Object.keys(STATIC_PAGES));
  const defaultPages = onDisk.get(defaultLocale) ?? new Set<string>();
  const everyKey = new Set(
    LOCALES.flatMap((locale) => [...(onDisk.get(locale) ?? [])]),
  );
  const problems = [
    ...[...defaultPages]
      .filter((key) => !declared.has(key))
      .map(
        (key) =>
          `page "${key}" has no STATIC_PAGES entry — its og:image 404s. ` +
          "Add bespoke EN+ES copy there. (A page that passes its own `image` " +
          "to BaseLayout needs no card, but give it an entry anyway — one " +
          "unused PNG is cheaper than an exemption list.)",
      ),
    ...[...declared]
      .filter((key) => !defaultPages.has(key))
      .map(
        (key) =>
          `STATIC_PAGES["${key}"] has no page — the card is generated for nothing`,
      ),
    ...[...everyKey]
      .filter((key) => LOCALES.some((locale) => !onDisk.get(locale)?.has(key)))
      .map(
        (key) =>
          `page "${key}" is missing in at least one locale — every locale is always generated`,
      ),
  ];
  if (problems.length > 0)
    throw new Error(
      `og: static page cards out of sync\n  - ${problems.join("\n  - ")}`,
    );
}

/** Localized "Blog" kicker for post + tag cards. */
const BLOG_KICKER: Record<Locale, string> = {
  en: "Blog · jmrp.io",
  es: "Blog · jmrp.io",
};

/** Localized kicker for editorial series hub cards. */
const SERIES_KICKER: Record<Locale, string> = {
  en: "Series · jmrp.io",
  es: "Serie · jmrp.io",
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
  assertStaticPagesCoverage();

  // Enumerate through the SAME helpers the page routes use. Both merge in the
  // EN entry whenever a translation is missing or draft-filtered, so
  // `/es/blog/<slug>/` exists even with no ES twin. A strict
  // `data.lang === locale` filter here would skip that page's card and ship a
  // 404 og:image — M1 all over again, in the ES locale.
  const [postsByLocale, toolsByLocale] = await Promise.all([
    Promise.all(
      LOCALES.map(async (locale) =>
        (await getPostsForLocale(locale)).map(({ post }) => post),
      ),
    ),
    Promise.all(
      LOCALES.map(async (locale) =>
        (await getToolsForLocale(locale)).map(({ tool }) => tool),
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

    // ── Editorial series hubs ─────────────────────────────────────────────
    const t = useTranslations(locale);
    for (const series of SERIES) {
      entries.push({
        params: { slug: ogSlug(locale, `blog/series/${series.slug}`) },
        props: {
          title: t(`series.${series.slug}.title` as TranslationKey),
          subtitle: SERIES_KICKER[locale],
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
