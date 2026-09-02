import blueskyFeeds from "@data/bluesky-feeds.json";
import type { Locale } from "@i18n/config";
import { type TranslationKey, useTranslations } from "@i18n/utils";
import { formatDateDot, getReadingTime } from "@utils/blog";
import {
  documentHeader,
  getPostsByLocale,
  getToolsByLocale,
  markdownTwinPath,
} from "@utils/llms";
import { CATEGORY_ORDER, categoryName } from "@utils/llms/tool-categories";
import { getSeries, getSeriesPosts, SERIES } from "@utils/series";

/**
 * Markdown twins for the LISTING pages: the blog and tools indexes, the tool
 * category pages, the editorial series index and its hubs, and /feeds/.
 *
 * ── Why listings get a twin at all ────────────────────────────────────────
 * The twins that existed covered every leaf document and not one of the pages
 * that say how the leaves relate. A series hub is the densest editorial prose
 * on this site — it states why a cluster exists, in what order to read it and
 * what it deliberately omits — which is the exact shape of answer a model
 * needs for "where do I start with X", and the exact thing a tag page cannot
 * give. Tag pages stay excluded on purpose: they are `noindex` listings with
 * no prose of their own.
 *
 * ── Why /homelab/ is not here ─────────────────────────────────────────────
 * Its figures are `HLM_*` tokens that nginx substitutes per request. A `.md`
 * under that path is served by the static-asset location, which runs no lua
 * filter and caches for a day, so the twin would publish the raw tokens and
 * then freeze them. That needs exact-match locations and a cache rule before
 * the document can exist; until then /homelab/ is absent from `TWINNED_PAGES`
 * in `@utils/llms` and nothing advertises a twin for it.
 *
 * ── Why the strict locale predicates ──────────────────────────────────────
 * These generators select content with `getPostsByLocale`/`getToolsByLocale`,
 * which filter on `data.lang`, and NOT with `getPostsForLocale`/
 * `getToolsForLocale`, which fall back to the English entry when a
 * translation is missing. The twin ROUTES filter strictly, so a fallback here
 * would have the Spanish index linking `/es/tools/<slug>/index.md` files that
 * were never generated — a dead link no checker would catch, since Lychee
 * only walks `dist/**\/*.html`.
 *
 * @module
 */
// cspell:locale es,en — the WORDS table below carries the Spanish half of the
// chrome these documents are written in, exactly like `CHROME` in
// `@utils/llms` (which gets the same treatment from an override in
// cspell.config.yaml). Declared in the file rather than in the config so the
// prose and the permission to spell-check it stay together.

/**
 * The prose this module writes around the content, per locale.
 *
 * Same split as `CHROME` in `@utils/llms`: field keys stay English because
 * they are a schema shared by every twin; sentences are localized because a
 * markdown file has no `lang` attribute and its own text is the only language
 * signal it carries.
 */
const WORDS = {
  postsIndex: {
    en: "Every post below publishes its own markdown twin; the body lives there, not here.",
    es: "Cada entrada publica su propio gemelo markdown; el cuerpo vive allí, no aquí.",
  },
  toolsIndex: {
    // The exception is stated here rather than left to the page's own intro,
    // which claims outright that nothing leaves the browser: two of the tools
    // do fetch the target they are pointed at, and llms.txt has said so for
    // months. A twin that repeats only the absolute claim would be the one
    // surface where the qualification disappears.
    en: "Every tool below publishes its own markdown twin with its full documentation. All of them run entirely in the browser except the certificate inspector and the HTTP header analyzer, which fetch the target you ask them to inspect.",
    es: "Cada herramienta publica su propio gemelo markdown con su documentación completa. Todas se ejecutan íntegramente en el navegador salvo el inspector de certificados y el analizador de cabeceras HTTP, que consultan el destino que les indiques.",
  },
  series: { en: "Series", es: "Series" },
  otherSeries: { en: "Other series", es: "Otras series" },
  feeds: { en: "RSS feeds", es: "Feeds RSS" },
  blueskyFeeds: { en: "Curated Bluesky feeds", es: "Feeds curados en Bluesky" },
  latest: { en: "Latest posts", es: "Últimas entradas" },
  categories: { en: "All categories", es: "Todas las categorías" },
} as const;

/** `/es` for Spanish, empty for English — the site's own routing rule. */
function prefixOf(locale: Locale): string {
  return locale === "es" ? "/es" : "";
}

/**
 * Posts newest-first, the order every listing page renders them in.
 *
 * `getPostsByLocale` sorts by numbered slug, which is what the corpus indexes
 * want; a listing has to match the page beside it instead.
 *
 * @param locale - Which locale.
 * @returns That locale's published posts, newest first.
 */
async function newestFirst(locale: Locale) {
  return (await getPostsByLocale(locale)).toSorted(
    (a, b) => b.data.publishedDate.valueOf() - a.data.publishedDate.valueOf(),
  );
}

/** `- [title](page): description ([markdown](twin))` — the index line shape. */
function indexLine(
  title: string,
  page: string,
  twin: string,
  description?: string,
): string {
  const summary = description ? `: ${description}` : "";
  return `- [${title}](${page})${summary} ([markdown](${twin}))`;
}

/**
 * The header every twin in this module shares.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Which locale.
 * @param path - Root-relative path of the page being twinned.
 * @param title - Document title.
 * @param extra - Further header lines.
 * @returns The header lines.
 */
function header(
  siteUrl: string,
  locale: Locale,
  path: string,
  title: string,
  extra: string[] = [],
): string[] {
  return documentHeader(
    title,
    `${siteUrl}${path}`,
    `${siteUrl}/llms.txt`,
    locale,
    extra,
  );
}

/**
 * The blog index as markdown: the listing, not the articles.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Which locale.
 * @returns The complete file body.
 */
export async function generateBlogIndexMarkdown(
  siteUrl: string,
  locale: Locale,
): Promise<string> {
  const t = useTranslations(locale);
  const prefix = prefixOf(locale);
  const posts = await newestFirst(locale);
  const seriesPath = `${prefix}/blog/series/`;
  return [
    ...header(siteUrl, locale, `${prefix}/blog/`, t("pages.blog.title"), [
      "",
      t("pages.blog.description"),
    ]),
    "",
    WORDS.postsIndex[locale],
    "",
    ...posts.map((post) => {
      const path = `${prefix}/blog/${post.data.slug}/`;
      const line = indexLine(
        post.data.title,
        `${siteUrl}${path}`,
        `${siteUrl}${markdownTwinPath(path)}`,
        post.data.description,
      );
      return `${line} — ${formatDateDot(post.data.publishedDate)}, ${getReadingTime(post)} ${t("pages.blog.minRead")}`;
    }),
    "",
    `## ${WORDS.series[locale]}`,
    "",
    t("series.ui.indexDescription"),
    "",
    indexLine(
      t("series.ui.indexTitle"),
      `${siteUrl}${seriesPath}`,
      `${siteUrl}${markdownTwinPath(seriesPath)}`,
    ),
    "",
    // The disclosure the page itself carries, verbatim. A model summarizing
    // this blog should be able to state how it is written.
    t("pages.blog.aiDisclaimer"),
    "",
  ].join("\n");
}

/**
 * The tools index as markdown, grouped by category in the page's own order.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Which locale.
 * @returns The complete file body.
 */
export async function generateToolsIndexMarkdown(
  siteUrl: string,
  locale: Locale,
): Promise<string> {
  const t = useTranslations(locale);
  const prefix = prefixOf(locale);
  const tools = await getToolsByLocale(locale);
  const grouped = CATEGORY_ORDER.flatMap((category) => {
    const inCategory = tools.filter((tool) => tool.data.category === category);
    if (inCategory.length === 0) return [];
    const categoryPath = `${prefix}/tools/categories/${category}/`;
    return [
      `## ${categoryName(t, category)}`,
      "",
      t(`pages.toolsCategory.${category}Desc` as TranslationKey),
      "",
      indexLine(
        categoryName(t, category),
        `${siteUrl}${categoryPath}`,
        `${siteUrl}${markdownTwinPath(categoryPath)}`,
      ),
      "",
      ...inCategory.map((tool) => {
        const path = `${prefix}/tools/${tool.data.slug}/`;
        return indexLine(
          tool.data.title,
          `${siteUrl}${path}`,
          `${siteUrl}${markdownTwinPath(path)}`,
          tool.data.description,
        );
      }),
      "",
    ];
  });
  return [
    ...header(siteUrl, locale, `${prefix}/tools/`, t("pages.tools.title"), [
      "",
      t("pages.tools.description"),
    ]),
    "",
    t("pages.tools.intro"),
    "",
    WORDS.toolsIndex[locale],
    "",
    ...grouped,
  ].join("\n");
}

/**
 * One tool category page as markdown.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Which locale.
 * @param category - The category id.
 * @returns The complete file body.
 */
export async function generateToolCategoryMarkdown(
  siteUrl: string,
  locale: Locale,
  category: string,
): Promise<string> {
  const t = useTranslations(locale);
  const prefix = prefixOf(locale);
  const tools = (await getToolsByLocale(locale)).filter(
    (tool) => tool.data.category === category,
  );
  const path = `${prefix}/tools/categories/${category}/`;
  return [
    ...header(siteUrl, locale, path, categoryName(t, category), [
      `Category: ${category}`,
      "",
      t(`pages.toolsCategory.${category}Desc` as TranslationKey),
    ]),
    "",
    // The category's own narrative — the copy that says what these tools are
    // FOR, which is the part a listing of names cannot carry.
    t(`pages.toolsCategory.${category}Context` as TranslationKey),
    "",
    ...tools.map((tool) => {
      const toolPath = `${prefix}/tools/${tool.data.slug}/`;
      return indexLine(
        tool.data.title,
        `${siteUrl}${toolPath}`,
        `${siteUrl}${markdownTwinPath(toolPath)}`,
        tool.data.description,
      );
    }),
    "",
    `## ${WORDS.categories[locale]}`,
    "",
    ...CATEGORY_ORDER.filter((other) => other !== category).map((other) => {
      const otherPath = `${prefix}/tools/categories/${other}/`;
      return indexLine(
        categoryName(t, other),
        `${siteUrl}${otherPath}`,
        `${siteUrl}${markdownTwinPath(otherPath)}`,
      );
    }),
    "",
  ].join("\n");
}

/**
 * The series index as markdown.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Which locale.
 * @returns The complete file body.
 */
export async function generateSeriesIndexMarkdown(
  siteUrl: string,
  locale: Locale,
): Promise<string> {
  const t = useTranslations(locale);
  const prefix = prefixOf(locale);
  const posts = await getPostsByLocale(locale);
  return [
    ...header(
      siteUrl,
      locale,
      `${prefix}/blog/series/`,
      t("series.ui.indexTitle"),
      ["", t("series.ui.indexDescription")],
    ),
    "",
    t("series.ui.indexLead"),
    "",
    ...SERIES.flatMap((series) => {
      const path = `${prefix}/blog/series/${series.slug}/`;
      const title = t(`series.${series.slug}.title` as TranslationKey);
      return [
        `## ${title}`,
        "",
        `URL: ${siteUrl}${path}`,
        `Markdown: ${siteUrl}${markdownTwinPath(path)}`,
        t("series.ui.countLabel", {
          count: getSeriesPosts(series, posts).length,
        }),
        "",
        t(`series.${series.slug}.description` as TranslationKey),
        "",
      ];
    }),
  ].join("\n");
}

/**
 * One editorial series hub as markdown — the whole argument, not a listing.
 *
 * This is the densest page in the set: around a thousand words of curated
 * itinerary per hub, stating why the cluster exists, what each member settles,
 * where it goes next and what it deliberately omits. None of it existed in
 * markdown, and none of it exists anywhere else in the corpus either: a post's
 * own frontmatter cannot know what the piece before it settled.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Which locale.
 * @param slug - The series slug.
 * @returns The complete file body.
 */
export async function generateSeriesMarkdown(
  siteUrl: string,
  locale: Locale,
  slug: string,
): Promise<string> {
  const series = getSeries(slug);
  if (!series) throw new Error(`Unknown series: ${slug}`);
  const t = useTranslations(locale);
  // The slug is only known at runtime, so the key is assembled — the same
  // pattern SeriesPage.astro uses for `series.<slug>.*`.
  const key = (suffix: string) => `series.${slug}.${suffix}` as TranslationKey;
  const prefix = prefixOf(locale);
  const posts = getSeriesPosts(series, await getPostsByLocale(locale));
  const path = `${prefix}/blog/series/${slug}/`;
  return [
    ...header(siteUrl, locale, path, t(key("title")), [
      "",
      t(key("description")),
    ]),
    "",
    t(key("lead")),
    "",
    t("series.ui.countLabel", { count: posts.length }),
    "",
    `## ${t(key("whyTitle"))}`,
    "",
    t(key("why1")),
    "",
    t(key("why2")),
    "",
    t(key("why3")),
    "",
    `## ${t(key("orderTitle"))}`,
    "",
    t(key("orderIntro")),
    "",
    ...posts.flatMap((post, index) => {
      const postPath = `${prefix}/blog/${post.data.slug}/`;
      return [
        `### ${t("series.ui.partLabel", { position: index + 1 })} — ${post.data.title}`,
        "",
        `URL: ${siteUrl}${postPath}`,
        `Markdown: ${siteUrl}${markdownTwinPath(postPath)}`,
        `Published: ${post.data.publishedDate.toISOString().slice(0, 10)}`,
        "",
        // The editorial note: why THIS article sits at THIS position. Keyed by
        // the numeric filename prefix the two locales share.
        t(key(`notes.p${post.data.slug.slice(0, 3)}`)),
        "",
      ];
    }),
    `## ${t(key("afterTitle"))}`,
    "",
    t(key("after1")),
    "",
    t(key("after2")),
    "",
    `## ${t(key("limitsTitle"))}`,
    "",
    t(key("limits1")),
    "",
    `## ${WORDS.otherSeries[locale]}`,
    "",
    ...SERIES.filter((other) => other.slug !== slug).map((other) => {
      const otherPath = `${prefix}/blog/series/${other.slug}/`;
      return indexLine(
        t(`series.${other.slug}.title` as TranslationKey),
        `${siteUrl}${otherPath}`,
        `${siteUrl}${markdownTwinPath(otherPath)}`,
        t(`series.${other.slug}.description` as TranslationKey),
      );
    }),
    "",
  ].join("\n");
}

/**
 * /feeds/ as markdown: the subscribable endpoints, which is what the page is.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Which locale.
 * @returns The complete file body.
 */
export async function generateFeedsMarkdown(
  siteUrl: string,
  locale: Locale,
): Promise<string> {
  const t = useTranslations(locale);
  const prefix = prefixOf(locale);
  const posts = (await newestFirst(locale)).slice(0, 5);
  return [
    ...header(siteUrl, locale, `${prefix}/feeds/`, t("pages.feeds.title"), [
      "",
      t("pages.feeds.description"),
    ]),
    "",
    t("pages.feeds.intro"),
    "",
    `## ${WORDS.feeds[locale]}`,
    "",
    `- ${t("pages.feeds.feedEnglish")}: ${siteUrl}/rss.xml`,
    `- ${t("pages.feeds.feedSpanish")}: ${siteUrl}/es/rss.xml`,
    "",
    `## ${WORDS.blueskyFeeds[locale]}`,
    "",
    t("pages.feeds.blueskyIntro"),
    "",
    // Both the human page on bsky.app and the canonical AT Protocol URI,
    // exactly the pair the page's own JSON-LD carries.
    ...blueskyFeeds.feeds.flatMap((feed) => [
      `### ${feed.name}`,
      "",
      feed.description,
      "",
      `- Language: ${feed.lang}`,
      `- URL: https://bsky.app/profile/jmrp.io/feed/${feed.rkey}`,
      `- AT URI: at://${blueskyFeeds.did}/app.bsky.feed.generator/${feed.rkey}`,
      "",
    ]),
    `## ${WORDS.latest[locale]}`,
    "",
    ...posts.map((post) => {
      const path = `${prefix}/blog/${post.data.slug}/`;
      return indexLine(
        post.data.title,
        `${siteUrl}${path}`,
        `${siteUrl}${markdownTwinPath(path)}`,
        post.data.description,
      );
    }),
    "",
  ].join("\n");
}
