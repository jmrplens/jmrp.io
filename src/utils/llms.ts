/**
 * llms.txt / llms-full.txt generators (llmstxt.org standard).
 *
 * Both files are generated from the content collections (posts, tools) so they
 * stay in sync with the site automatically — no hand maintenance. `llms.txt` is
 * a concise link index; `llms-full.txt` enriches each post with its description,
 * tags, FAQ questions, and HowTo step names (all sourced from frontmatter).
 */
import {
  stripLocalePrefix,
  type TranslationKey,
  useTranslations,
} from "@i18n/utils";
import { pageLastmod } from "@src/integrations/sitemap-post-dates";
import type { CVData, SiteConfig } from "@src/types";
import { getCVData } from "@utils/cv";
import { stripToText } from "@utils/html";
import { registry } from "@utils/llms/mdx/registry";
import { mdxToMarkdown } from "@utils/llms/mdx/render";
import {
  aboutLines,
  projectsLines,
  usesLines,
} from "@utils/llms/profile-markdown";
import {
  HOME_SECTIONS,
  PROFILE_SECTIONS,
  SITE_SECTIONS,
} from "@utils/llms/sections";
import { getMcpServers, type McpServer } from "@utils/projects";
import {
  getPublications,
  type PublicationGroup,
  stripTrailingPunctuation,
} from "@utils/publications";
import { SERIES } from "@utils/series";
import { buildSameAs } from "@utils/site";
import type { CollectionEntry } from "astro:content";
import { getCollection, getEntry } from "astro:content";

/** Curated, site-level narrative reused by both files. */
const DESCRIPTION =
  "Personal technical blog and portfolio of José Manuel Requena Plens — R&D Engineer specializing in Embedded Systems, Acoustics, and Industrial Software Development.";

const ABOUT =
  "José Manuel Requena Plens (JMRP) is a multidisciplinary engineer working across firmware, embedded systems, and applied research. Background in solar-inverter firmware and industrial control systems, Acoustics research, noise mitigation for the European Space Agency (ESA), and biomedical ultrasound at UPV. Active open source contributor and self-hoster.";

/*
 * The MCP section gets its own H2 rather than a line under `## Sections`
 * because these are not pages to read: they are endpoints a client can CALL.
 * An agent that follows `servers.json` gets the same list as machine-readable
 * JSON, which is the form it actually needs. The site they belong to
 * (mcp.jmrp.io) publishes its own `llms.txt`; the block exists so the
 * connection is discoverable from jmrp.io, whose graph already claims
 * authorship of the servers.
 */

/**
 * Endpoint-specific prose per fleet member, keyed by project id. Richer than
 * the language-neutral `summary` in projects.yaml because it can state the
 * calling contract (credentials, headers). A server with no entry here still
 * gets a bullet — `mcpBlock` falls back to the YAML summary — so growing the
 * fleet never silently drops a line from this section.
 */
const MCP_PROSE: Record<string, { en: string; es: string }> = {
  "libgen-mcp": {
    en: "Search and download books, papers, comics, magazines and standards from Library Genesis. No credentials required.",
    es: "Busca y descarga libros, artículos, cómics, revistas y normas de Library Genesis. Sin credenciales.",
  },
  "gitlab-mcp-server": {
    en: "Over 1,000 GitLab operations as tools. Needs a `PRIVATE-TOKEN` header per request; the token is never stored server-side.",
    es: "Más de 1.000 operaciones de GitLab como tools. Requiere una cabecera `PRIVATE-TOKEN` por petición; el token nunca se guarda en el servidor.",
  },
};

const MCP_INTRO = {
  en: [
    "## MCP Servers (self-hosted, different domain)",
    "",
    "- [mcp.jmrp.io](https://mcp.jmrp.io/): Public Model Context Protocol servers the author runs on his own infrastructure, with a browser inspector to try them. Streamable HTTP transport; `POST` only — a `GET` on an endpoint returns 405 by design.",
  ],
  es: [
    "## Servidores MCP (autoalojados, en otro dominio)",
    "",
    "- [mcp.jmrp.io](https://mcp.jmrp.io/es/): Servidores públicos de Model Context Protocol que el autor ejecuta en su propia infraestructura, con un inspector en el navegador para probarlos. Transporte Streamable HTTP; solo `POST` — un `GET` a un endpoint devuelve 405 por diseño.",
  ],
};

/** One `- [name](endpoint): prose Source: [repo].` bullet for a fleet member. */
function mcpBullet(server: McpServer, locale: "en" | "es"): string {
  const label =
    new URL(server.endpoint).pathname.split("/").findLast(Boolean) ?? server.id;
  const prose = MCP_PROSE[server.id]?.[locale] ?? server.summary[locale];
  const source = locale === "es" ? "Código" : "Source";
  return `- [${label}](${server.endpoint}): ${prose} ${source}: [${server.id}](${server.repo}).`;
}

/**
 * The author's self-hosted MCP fleet as an `llms.txt` section, driven by the
 * `endpoint` field in projects.yaml (the same source BaseHead's `owns` and the
 * /homelab/ card consume).
 */
async function mcpBlock(locale: "en" | "es"): Promise<string> {
  const servers = await getMcpServers();
  return [
    ...MCP_INTRO[locale],
    ...servers.map((server) => mcpBullet(server, locale)),
    locale === "es"
      ? "- [servers.json](https://mcp.jmrp.io/servers.json): La misma lista como JSON legible por máquina, para clientes automáticos."
      : "- [servers.json](https://mcp.jmrp.io/servers.json): The same list as machine-readable JSON, for automatic clients.",
  ].join("\n");
}

/**
 * The author's public profiles, for the `## Contact` section.
 *
 * Derived from the SAME source as the Person JSON-LD rather than listed here.
 * The hardcoded version carried six entries while `person.jsonld` — which this
 * very file links under `## Optional` — carried fourteen: Bluesky, Matrix,
 * Keyoxide, ResearchGate, MathWorks, Codeberg, GitLab, PyPI and Docker Hub
 * never reached the corpus. A model reading llms.txt saw a smaller person than
 * the machine-readable entity beside it.
 *
 * @param siteData - The site config entry.
 * @returns Markdown list items.
 */
async function contactLines(siteData: SiteConfig): Promise<string[]> {
  // The address comes from `about.person.email`, the same field BaseHead feeds
  // to the Person JSON-LD (`BaseHead.astro:301`). Hardcoding `mail@jmrp.io`
  // here was the very duplication this function exists to remove — it derived
  // the fourteen profiles from the canonical source and then wrote the address
  // by hand two lines below.
  const about = await getEntry("profile", "about");
  const email =
    about?.data.type === "about" ? about.data.person.email : undefined;
  // Typed explicitly: the schema declares `name: z.string()`, but `SiteConfig`
  // is an `Extract` over a discriminated union and the inference does not carry
  // that through — which reads, to a static analyser, as a possible object
  // reaching string interpolation.
  const named = new Map<string, string>(
    (siteData.social_links ?? []).map((l) => [l.url, l.name]),
  );
  const profiles = buildSameAs(siteData.social_links, siteData.person?.sameAs);
  return [
    ...profiles.map((url) => `[${named.get(url) ?? hostLabel(url)}](${url})`),
    ...(email ? [`[Email](mailto:${email})`] : []),
  ];
}

/**
 * Names for the `person.sameAs` extras, which are bare URLs in the config.
 *
 * Those entries exist to strengthen entity recognition rather than to be
 * rendered, so they carry no label. The host is a usable fallback but a poor
 * name — "Google Scholar" is the entity a model knows, "scholar.google.com"
 * is a string it has to resolve. Keyed by host so a changed profile path does
 * not silently lose its name.
 */
const PROFILE_NAMES: Record<string, string> = {
  "scholar.google.com": "Google Scholar",
  "orcid.org": "ORCID",
  "researchgate.net": "ResearchGate",
  "mathworks.com": "MATLAB Central",
  "codeberg.org": "Codeberg",
  "gitlab.com": "GitLab",
  "pypi.org": "PyPI",
  "hub.docker.com": "Docker Hub",
  "keyoxide.org": "Keyoxide",
};

/**
 * A readable label for a profile URL that has no configured name.
 *
 * @param url - The profile URL.
 * @returns Its well-known name, or the host as a fallback.
 */
function hostLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./u, "");
    return PROFILE_NAMES[host] ?? host;
  } catch {
    return url;
  }
}

const TECHNICAL_DETAILS = [
  "Built with Astro 7 (Static Site Generation)",
  "Bilingual: English (default) and Spanish — all content available in both languages under the /es/ prefix",
  "Zero client-side JavaScript (except progressive enhancement islands)",
  "WCAG 2.2 AA/AAA accessibility compliant",
  "Content Security Policy with SRI hashes",
  "RSS feeds: https://jmrp.io/rss.xml (EN) and https://jmrp.io/es/rss.xml (ES)",
];

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Every landing page that publishes a markdown twin, locale-agnostic.
 *
 * ONE list, read by all three surfaces that make a claim about twins:
 * `buildProfileSections` (llms-full.txt), `sectionsBlock` (llms.txt) and
 * `HOME_SECTIONS` (the homepage twin). They used to disagree — llms-full.txt
 * knew about two of them, llms.txt advertised none, and the homepage twin
 * carried its own hand-kept boolean — so a page could gain a twin and stay
 * invisible in two of the three indexes, or worse, be advertised at a URL
 * that 404s. Membership here is a fact about which `index.md.ts` routes exist
 * under `src/pages/`, so adding a route and adding a line here is one change.
 *
 * `/homelab/` is deliberately absent: its figures are substituted by nginx per
 * request, and a `.md` served by the static-asset location would publish the
 * raw `HLM_*` tokens and then cache them for a day. It gets its entry when
 * the server side is resolved.
 *
 * `/blog/` and `/tools/` are absent for a different reason, and it is not an
 * oversight: llms.txt already lists every post and every tool with its title,
 * description and its own twin link, so a twin of the listing page would be a
 * verbatim second copy of a section of the index that points at it. The series
 * hubs and the tool categories DO get one, because their pages carry hand-
 * written prose — a reading order, a "use these when" paragraph — that exists
 * nowhere else.
 */
const TWINNED_PAGES: ReadonlySet<string> = new Set([
  "/",
  "/about/",
  "/blog/series/",
  "/cv/",
  "/feeds/",
  "/privacy/",
  "/projects/",
  "/publications/",
  "/uses/",
]);

/**
 * Renders {@link PROFILE_SECTIONS} as llms-full.txt blocks.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Which language to render, matching the document being built.
 *   Without this the Spanish document carried English profile prose under
 *   Spanish section headings, which is worse than omitting it.
 * @returns Markdown lines, ready to splice into the document.
 */
function buildProfileSections(
  siteUrl: string,
  locale: "en" | "es" = "en",
): string[] {
  const localePrefix = locale === "es" ? "/es" : "";
  return PROFILE_SECTIONS.flatMap((section) => {
    const localized = locale === "es" ? section.es : section.en;
    return [
      `## ${localized.title}`,
      "",
      `URL: ${siteUrl}${localePrefix}${section.url}`,
      // The twin, where one exists. Its content is generated from the same
      // YAML the page renders, so it cannot drift from what a visitor sees —
      // unlike the curated lines below it, which is where a claim about a
      // Nextcloud that does not exist survived for months.
      ...(TWINNED_PAGES.has(section.url)
        ? [
            `Markdown: ${siteUrl}${markdownTwinPath(localePrefix + section.url)}`,
          ]
        : []),
      "",
      ...localized.lines,
      "",
    ];
  });
}

/**
 * Flattens a BibTeX abstract onto a single line.
 *
 * Abstracts in `papers.bib` are hard-wrapped across many lines; left as-is they
 * would break the one-item-per-line shape the rest of this document uses.
 *
 * @param value - Raw abstract text.
 * @returns The same text with runs of whitespace collapsed to single spaces.
 */
function collapseWhitespace(value: string): string {
  return value.replaceAll(/\s+/gu, " ").trim();
}

/**
 * Renders the CV as labelled markdown.
 *
 * The previous version walked the object generically and pushed every string it
 * met, which discarded the key. A role, its four institutions, a location and a
 * date range arrived as six unlabelled sibling bullets, so nothing in 427 lines
 * of the corpus said which was which — the reader had to infer that "Valencia,
 * Spain" was a location and not an employer. Typing the walk to the schema costs
 * one branch per section kind and makes every value self-describing.
 *
 * Root-relative links inside the inline markdown are made absolute: this document
 * is read away from the site, where `/pdf/…` resolves nowhere.
 *
 * @param cv - The CV collection data.
 * @param siteUrl - Absolute site origin, for root-relative links.
 * @returns Markdown lines.
 */
const CV_LABELS = {
  en: {
    location: "Location",
    availability: "Availability",
    email: "Email",
    links: "Links",
    department: "Department",
    period: "Period",
    downloads: "Downloadable versions (PDF)",
  },
  es: {
    location: "Ubicación",
    availability: "Disponibilidad",
    email: "Correo",
    links: "Enlaces",
    department: "Departamento",
    period: "Periodo",
    downloads: "Versiones descargables (PDF)",
  },
} as const;

/** ` (text)`, or nothing when the value is absent. */
function parenthetical(value?: string): string {
  return value ? ` (${value})` : "";
}

/** `. text.`, or just `.`, for the venue tail of a citation line. */
function suffixed(value?: string): string {
  return value ? `. ${value}.` : ".";
}

/** ` — text`, or nothing when the value is absent. */
function dashed(value?: string): string {
  return value ? ` — ${value}` : "";
}

/** `Name (Q123)` — extracted so the post entry is not a nested template. */
function namedTopic(topic: { name: string; wikidata: string }): string {
  return `${topic.name} (${topic.wikidata})`;
}

/** `label (url)` — extracted so the CV header is not a nested template. */
function labelledUrl(link: { label: string; url: string }): string {
  return `${link.label} (${link.url})`;
}

/** One CV section's body, by kind. Split out to keep the walker flat. */
const CV_SECTION_BODY = {
  experience: (section, ctx) =>
    section.items.flatMap((item) => [
      `- **${item.role}** — ${ctx.orgs(item.org)}`,
      ...ctx.chrono(item),
    ]),
  education: (section, ctx) =>
    section.items.flatMap((item) => [
      `- **${item.degree}** — ${ctx.orgs(item.org)}`,
      ...ctx.chrono(item),
    ]),
  skills: (section, ctx) => [
    ...section.groups.map(
      (group) =>
        `- **${group.category}**: ${group.items.map(ctx.skill).join(", ")}`,
    ),
    "",
  ],
  projects: (section, ctx) =>
    section.items.flatMap((item) => [
      `- **${item.name}**${parenthetical(item.tech)}`,
      ...(item.description ? [`  ${ctx.prose(item.description)}`] : []),
      ...(item.metrics ?? []).map((m) => `  - ${m}`),
      ...(item.links ?? []).map((l) => `  - ${l.label}: ${l.url}`),
      "",
    ]),
  certificates: (section, ctx) => [
    ...section.groups.flatMap((group) => [
      `- **${group.category}**`,
      ...group.items.map((item) => `  - ${ctx.certificate(item)}`),
    ]),
    "",
  ],
  // Each entry is typed against its own member of the discriminated union, so
  // `satisfies` here is what guarantees a new `kind` cannot be added to the
  // schema without this map gaining a branch.
} satisfies {
  [K in CVData["sections"][number]["kind"]]: (
    section: Extract<CVData["sections"][number], { kind: K }>,
    ctx: CvContext,
  ) => string[];
};

/** Shared formatting helpers handed to every section renderer. */
interface CvContext {
  orgs: (list: { name: string }[]) => string;
  prose: (text: string) => string;
  chrono: (item: CvChronoItem) => string[];
  skill: (item: { name: string; note?: string }) => string;
  certificate: (item: {
    name: string;
    school?: string;
    hours?: string;
  }) => string;
}

/**
 * The identity block that opens the CV twin: name, headline and contact.
 *
 * Split out of {@link cvToMarkdown} because every field here is optional, and
 * six independent guards in the middle of a function that also walks sections
 * and downloads is most of that function's cognitive load for none of its
 * meaning.
 *
 * @param b - The CV's `basics`.
 * @param L - Localized labels for this document.
 * @param prose - Collapses whitespace and rewrites relative links as absolute.
 * @returns The opening markdown lines.
 */
function cvBasicsLines(
  b: CVData["basics"],
  L: (typeof CV_LABELS)["en" | "es"],
  prose: (text: string) => string,
): string[] {
  return [
    `**${b.name}** — ${b.headline}`,
    "",
    ...(b.location ? [`${L.location}: ${b.location}`] : []),
    ...(b.availability ? [`${L.availability}: ${b.availability}`] : []),
    ...(b.email ? [`${L.email}: ${b.email}`] : []),
    ...(b.links && b.links.length > 0
      ? [`${L.links}: ${b.links.map(labelledUrl).join(", ")}`]
      : []),
    "",
    ...(b.profile ? [prose(b.profile), ""] : []),
  ];
}

/**
 * The downloads section of the CV twin, one line per published file.
 *
 * The PDFs were invisible from this document: the HTML page links them, but an
 * agent reading the twin had no way to discover they exist. Absolute URLs, and
 * the page's own wording for each format so the reader can pick the right one.
 *
 * @param downloads - The CV's download groups.
 * @param L - Localized labels for this document.
 * @param siteUrl - Absolute site origin, for the file URLs.
 * @returns The markdown lines, empty when nothing is published.
 */
function cvDownloadLines(
  downloads: CVData["downloads"],
  L: (typeof CV_LABELS)["en" | "es"],
  siteUrl: string,
): string[] {
  if (downloads.length === 0) return [];
  return [
    `## ${L.downloads}`,
    "",
    ...downloads.flatMap((fmt) => {
      const note = fmt.note ? ` — ${fmt.note}` : "";
      return fmt.files.map(
        (file) =>
          `- [${file.label} · ${fmt.format}](${siteUrl}${file.url})${note}`,
      );
    }),
    "",
  ];
}

/** The fields every chronological CV entry shares. */
interface CvChronoItem {
  department?: { name: string };
  location?: string;
  period?: string | number;
  summary?: string;
  notes?: string[];
  bullets?: string[];
}

function cvToMarkdown(
  cv: CVData,
  siteUrl: string,
  locale: "en" | "es",
): string[] {
  // The section titles come from the YAML and are already localized, so
  // English labels around them would be the only foreign words in the
  // document. Same shape as MCP_PROSE above rather than new i18n keys: these
  // strings exist for this file alone and never reach a rendered page.
  const L = CV_LABELS[locale];
  const prose = (text: string) =>
    collapseWhitespace(text).replaceAll(
      /\]\((\/[^)]*)\)/gu,
      (_m, path: string) => "](" + siteUrl + path + ")",
    );

  const ctx: CvContext = {
    prose,
    orgs: (list) => list.map((o) => o.name).join(", "),
    skill: (item) => `${item.name}${parenthetical(item.note)}`,
    certificate: (item) =>
      `${item.name}${dashed(item.school)}${parenthetical(item.hours)}`,
    chrono: (item) => [
      ...(item.department
        ? [`  ${L.department}: ${item.department.name}`]
        : []),
      ...(item.location ? [`  ${L.location}: ${item.location}`] : []),
      ...(item.period ? [`  ${L.period}: ${item.period}`] : []),
      ...(item.summary ? ["", `  ${prose(item.summary)}`] : []),
      ...(item.bullets ?? []).map((b) => `  - ${prose(b)}`),
      ...(item.notes ?? []).map((n) => `  - ${prose(n)}`),
      "",
    ],
  };

  const out: string[] = cvBasicsLines(cv.basics, L, prose);

  for (const section of cv.sections) {
    // H2, not H3: the only caller is `generateCvMarkdown`, whose `# <name>` is
    // one line above, so the document went H1 → H3 and had no H2 at all —
    // which breaks any consumer that segments a document by heading level.
    out.push(`## ${section.title}`, "");
    // The cast re-links section to its own branch: TypeScript narrows the
    // union on `section.kind` but cannot narrow the lookup that follows.
    const render = CV_SECTION_BODY[section.kind] as (
      s: typeof section,
      c: CvContext,
    ) => string[];
    out.push(...render(section, ctx));
  }

  out.push(...cvDownloadLines(cv.downloads, L, siteUrl));
  return out;
}

/**
 * Published posts for one locale, ordered by numbered slug (chronological).
 *
 * Exported for `@utils/llms/listing-markdown`. Deliberately NOT
 * `getPostsForLocale` from `@utils/blog`, which falls back to the English
 * entry when a translation is missing: the twin routes filter strictly on
 * `data.lang`, so a fallback entry would make the Spanish index link an
 * `/es/blog/<slug>/index.md` that was never generated.
 *
 * @param lang - The locale to select.
 * @returns That locale's published posts.
 */
export async function getPostsByLocale(lang: "en" | "es") {
  const posts = await getCollection(
    "posts",
    (p) => p.data.lang === lang && !p.data.draft,
  );
  return posts.sort((a, b) => a.data.slug.localeCompare(b.data.slug));
}

/**
 * Tools for one locale, alphabetical within that locale.
 *
 * Exported, and strict on `data.lang`, for the same reason as
 * {@link getPostsByLocale}.
 *
 * @param lang - The locale to select.
 * @returns That locale's tools.
 */
export async function getToolsByLocale(lang: "en" | "es") {
  const tools = await getCollection("tools", (t) => t.data.lang === lang);
  return tools.sort((a, b) => a.data.title.localeCompare(b.data.title));
}

/**
 * Builds the locale-aware absolute URL for a tool entry — `/tools/<slug>/`
 * for English entries, `/es/tools/<slug>/` for Spanish entries. Callers pass
 * already locale-filtered lists (see `getToolsByLocale()`), but the URL is
 * still derived from `tool.data.lang` rather than the caller's intent, so it
 * stays correct even if that invariant ever drifts.
 */
function toolUrl(siteUrl: string, tool: CollectionEntry<"tools">): string {
  const localePrefix = tool.data.lang === "es" ? "/es" : "";
  return `${siteUrl}${localePrefix}/tools/${tool.data.slug}/`;
}

/**
 * One `- [title](page): description ([plain text](twin))` line for llms.txt.
 *
 * The index advertised the twin of all 24 posts and of none of the 34 tools,
 * which is an inconsistency inside a single file: an agent that learned the
 * convention from the Blog section had no reason to believe it also applied
 * to Tools, so those 34 documents stayed one guess away.
 *
 * @param siteUrl - Absolute site origin.
 * @param tool - The tool entry.
 * @param locale - Language of the twin's link label.
 * @returns The index line.
 */
function toolIndexLine(
  siteUrl: string,
  tool: CollectionEntry<"tools">,
  locale: "en" | "es",
): string {
  const page = toolUrl(siteUrl, tool);
  const twin = `${siteUrl}${markdownTwinPath(new URL(page).pathname)}`;
  const label = locale === "es" ? "texto plano" : "plain text";
  return `- [${tool.data.title}](${page}): ${tool.data.description} ([${label}](${twin}))`;
}

/**
 * The editorial series hubs, as an `llms.txt` section.
 *
 * These were missing entirely: the file had zero references to `/blog/series/`
 * or any hub. They are, after the posts themselves, the densest citable pages
 * on the site — a tag page can only list articles, whereas a hub states why
 * the cluster exists, in what order to read it, and what it deliberately does
 * not cover. That framing is exactly what a model needs to summarize a topic
 * rather than a single post.
 */
function seriesBlock(siteUrl: string, locale: "en" | "es"): string {
  const t = useTranslations(locale);
  const prefix = locale === "es" ? "/es" : "";
  const heading = locale === "es" ? "## Series (Español)" : "## Series";
  const indexPath = `${prefix}/blog/series/`;
  return [
    heading,
    "",
    // Each hub and the index now publish a twin, so the line carries both —
    // the page is the URL worth citing, the twin is the one worth reading.
    `- [${t("series.ui.indexTitle")}](${siteUrl}${indexPath}): ${t(
      "series.ui.indexDescription",
    )} ([markdown](${siteUrl}${markdownTwinPath(indexPath)}))`,
    // The slug is only known at runtime, so the key is cast — the same
    // pattern SeriesPage.astro uses for `series.<slug>.*`.
    ...SERIES.map(({ slug }) => {
      const title = t(`series.${slug}.title` as TranslationKey);
      const description = t(`series.${slug}.description` as TranslationKey);
      const path = `${prefix}/blog/series/${slug}/`;
      return `- [${title}](${siteUrl}${path}): ${description} ([markdown](${siteUrl}${markdownTwinPath(path)}))`;
    }),
  ].join("\n");
}

/**
 * The section map for one locale, each entry with its twin where one exists.
 *
 * The twin link is what makes the new listing documents reachable from the
 * index: an agent that landed on llms.txt had to guess the `index.md`
 * convention to get the machine-readable form of anything but a post.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Which language to render.
 * @returns The `## Sections` block.
 */
function sectionsBlock(siteUrl: string, locale: "en" | "es"): string {
  const prefix = locale === "es" ? "/es" : "";
  return [
    locale === "es" ? "## Sections (Español)" : "## Sections",
    "",
    ...SITE_SECTIONS.map((section) => {
      const copy = section[locale];
      const twin = TWINNED_PAGES.has(section.path)
        ? ` ([markdown](${siteUrl}${markdownTwinPath(prefix + section.path)}))`
        : "";
      return `- [${copy.title}](${siteUrl}${prefix}${section.path}): ${copy.description}${twin}`;
    }),
  ].join("\n");
}

/** Generates the concise `llms.txt` index. */
export async function generateLlmsTxt(siteUrl: string): Promise<string> {
  const siteEntry = await getEntry("site_config", "site");
  const siteData = (siteEntry?.data ?? {}) as SiteConfig;
  const postsEn = await getPostsByLocale("en");
  const postsEs = await getPostsByLocale("es");
  const toolsEn = await getToolsByLocale("en");
  const toolsEs = await getToolsByLocale("es");

  const lines = [
    "# jmrp.io",
    "",
    `> ${DESCRIPTION}`,
    "",
    `Last updated: ${today()}`,
    "",
    ABOUT,
    "",
    "Technical details:",
    "",
    ...TECHNICAL_DETAILS.map((d) => `- ${d}`),
    "",
    `For comprehensive context including blog post topics, FAQs, and tool features, see [llms-full.txt](${siteUrl}/llms-full.txt).`,
    "",
    sectionsBlock(siteUrl, "en"),
    "",
    sectionsBlock(siteUrl, "es"),
    "",
    seriesBlock(siteUrl, "en"),
    "",
    seriesBlock(siteUrl, "es"),
    "",
    "## Blog Posts",
    "",
    // The canonical article first — that is the URL worth citing — then the
    // shard, so a model can reach the full body in one hop. Before this the
    // index never mentioned the shards at all, leaving every post body two
    // hops away behind an `## Optional` link.
    ...postsEn.map(
      (p) =>
        `- [${p.data.title}](${siteUrl}/blog/${p.data.slug}/)${
          p.data.description ? `: ${p.data.description}` : ""
        } ([plain text](${siteUrl}${llmsPostShardPath("en", p.data.slug)}))`,
    ),
    "",
    "## Blog Posts (Español)",
    "",
    ...postsEs.map(
      (p) =>
        `- [${p.data.title}](${siteUrl}/es/blog/${p.data.slug}/)${
          p.data.description ? `: ${p.data.description}` : ""
        } ([texto plano](${siteUrl}${llmsPostShardPath("es", p.data.slug)}))`,
    ),
    "",
    "## Developer Tools",
    "",
    // The canonical page first, then its twin — the same two-link shape the
    // post lines above use.
    ...toolsEn.map((tool) => toolIndexLine(siteUrl, tool, "en")),
    "",
    "## Developer Tools (Español)",
    "",
    ...toolsEs.map((tool) => toolIndexLine(siteUrl, tool, "es")),
    "",
    // Both languages, like every other section of this bilingual index.
    await mcpBlock("en"),
    "",
    await mcpBlock("es"),
    "",
    "## Contact",
    "",
    ...(await contactLines(siteData)).map((c) => `- ${c}`),
    "",
    "## Optional",
    "",
    `- [Person entity (JSON-LD)](${siteUrl}/identity/person.jsonld): Machine-readable identity node for the author`,
    // No byte figure: the hand-maintained one drifted twice and ended up
    // claiming ~1.2 MB for a 58 KB file, while robots.txt claimed ~43 KB for
    // the same file. A pipeline budgeting on either number skipped it.
    `- [Full context](${siteUrl}/llms-full.txt): Both languages in one document — every tool in full, plus a linked index of every post`,
    `- [RSS feed (EN)](${siteUrl}/rss.xml): English blog feed`,
    `- [RSS feed (ES)](${siteUrl}/es/rss.xml): Spanish blog feed`,
    "",
  ];
  return lines.join("\n");
}

/**
 * Path of the per-post markdown twin, relative to the site root.
 *
 * Post bodies live in their own file rather than inlined in `llms-full*.txt`:
 * the twelve English posts alone were 557 KB of a 587 KB document (94.8%), so
 * any cap an ingestion pipeline applies lands in the middle of a post. One file
 * per post is naturally bounded and lets an agent fetch exactly the guide it
 * needs instead of the whole corpus.
 *
 * The path MIRRORS the article's own URL with `index.md` appended, which is
 * what the spec prescribes for a URL that has no file name. The shape before
 * that — `/llms-blog-<locale>-<slug>.txt` at the
 * site root — could not be derived from anything: an agent holding `/blog/005-foo/` had to invent
 * a prefix AND move the locale from a path segment to a filename infix, while
 * the convention it would actually try (append `.md`) returned 404. The access
 * log agrees: across its whole history `/llms.txt` and `/llms-full.txt` were
 * fetched 69 and 63 times, and the shards not once.
 *
 * @param locale - Post locale.
 * @param slug - Post slug, already carrying its `NNN-` prefix.
 * @returns Root-relative path, e.g. `/blog/003-…/index.md`.
 */
export function llmsPostShardPath(locale: "en" | "es", slug: string): string {
  return markdownTwinPath(`${locale === "es" ? "/es" : ""}/blog/${slug}/`);
}

/** Renders a single post as the `### title` block used by llms-full and shards. */
function buildPostEntry(
  p: CollectionEntry<"posts">,
  siteUrl: string,
  localePrefix: "" | "/es",
  locale: "en" | "es",
): string[] {
  const d = p.data;
  const postUrl = `${siteUrl}${localePrefix}/blog/${d.slug}/`;
  return [
    // No `### <title>` here: the only caller is the shard, whose `# <title>`
    // header names the post one line above. Emitting both put the article
    // title in the document twice and pushed every real section down a level.
    `URL: ${postUrl}`,
    `Language: ${locale}`,
    `Alternate: ${alternateTwinUrl(postUrl, locale)}`,
    `Type: ${d.articleType}`,
    `Published: ${d.publishedDate.toISOString().slice(0, 10)}`,
    ...(d.updatedDate
      ? [`Updated: ${d.updatedDate.toISOString().slice(0, 10)}`]
      : []),
    // The strongest freshness claim the article makes — re-tested on this
    // date, against these versions — and it reached no machine-readable
    // surface at all: the page renders it under the title and the twin
    // dropped it, so a model reading the markdown could not tell a guide
    // verified last week from one last touched two years ago. Same source as
    // the page and the JSON-LD: the post's own `lastVerified` frontmatter.
    // The versions are appended only when there are any — the schema defaults
    // them to an empty array, which would otherwise leave a dangling `·`.
    ...(d.lastVerified
      ? [
          `Last verified: ${d.lastVerified.date.toISOString().slice(0, 10)}${
            d.lastVerified.versions.length > 0
              ? ` · ${d.lastVerified.versions.join(" · ")}`
              : ""
          }`,
        ]
      : []),
    ...(d.author ? [`Author: ${d.author}`] : []),
    ...(d.description ? [`Summary: ${d.description}`] : []),
    ...(d.tags.length > 0 ? [`Tags: ${d.tags.join(", ")}`] : []),
    ...(d.topics && d.topics.length > 0
      ? [`Topics: ${d.topics.map(namedTopic).join(", ")}`]
      : []),
    // The ANSWER, not only the question. Emitting the questions alone
    // published the promise and withheld the payload: these pairs are the
    // most directly citable prose on the site — they are written as the
    // query a reader actually types — and the page already renders them and
    // ships them as FAQPage JSON-LD.
    ...(d.faq && d.faq.length > 0
      ? [
          "",
          CHROME.questions[locale],
          "",
          ...d.faq.flatMap((f) => [`**${f.question}**`, "", f.answer, ""]),
        ]
      : []),
    ...((d.howto?.steps?.length ?? 0) > 0
      ? [
          "",
          `${CHROME.steps[locale]} (${d.howto?.name}):`,
          ...(d.howto?.steps ?? []).map((s, i) => `${i + 1}. ${s.name}`),
        ]
      : []),
    ...(p.body
      ? [
          "",
          "---",
          "",
          mdxToMarkdown(p.body, {
            locale: localePrefix === "/es" ? "es" : "en",
            siteUrl,
            registry,
          }),
        ]
      : []),
    "",
  ];
}

/**
 * Renders the index that replaces the inlined post bodies in `llms-full*.txt`.
 *
 * Each line is a real markdown link so a parser that treats `##` sections as
 * link lists (per llmstxt.org) can follow them, plus the one-line description
 * so an agent can pick the right shard without fetching any of them.
 *
 * @param posts - The locale's posts, newest first.
 * @param siteUrl - Absolute site origin.
 * @param locale - Post locale.
 * @returns Lines for the section body.
 */
function buildPostIndex(
  posts: CollectionEntry<"posts">[],
  siteUrl: string,
  locale: "en" | "es",
): string[] {
  const note =
    locale === "es"
      ? "El cuerpo completo de cada artículo vive en su propio fichero, para que ningún límite de ingesta corte a mitad de una guía:"
      : "Each post's full body lives in its own file, so no ingestion cap ever truncates mid-guide:";
  return [
    note,
    "",
    // Both URLs: the shard carries the body, but a model that answers from it
    // needs the canonical article to cite. Linking only the `.txt` made every
    // citation point at a plain-text file instead of the page.
    ...posts.map((p) => {
      const d = p.data;
      const shard = `${siteUrl}${llmsPostShardPath(locale, d.slug)}`;
      const article = `${siteUrl}${locale === "es" ? "/es" : ""}/blog/${d.slug}/`;
      const summary = d.description ? `: ${d.description}` : "";
      const label = locale === "es" ? "artículo" : "article";
      return `- [${d.title}](${shard})${summary} ([${label}](${article}))`;
    }),
    "",
  ];
}

/**
 * Builds a standalone per-post document: the same block `llms-full` used to
 * inline, wrapped in enough header for the file to stand on its own.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Post locale.
 * @param post - The post to render.
 * @returns The complete file body.
 */
export function generateLlmsPostTxt(
  siteUrl: string,
  locale: "en" | "es",
  post: CollectionEntry<"posts">,
): string {
  const localePrefix = locale === "es" ? "/es" : "";
  // Straight to the file, not `llms-full-<locale>.txt`: the per-locale names
  // were consolidated into one and now 301 there, so every shard was sending
  // its reader through a redirect to reach its own index.
  const parent = `${siteUrl}/llms-full.txt`;
  return [
    `# ${post.data.title}`,
    "",
    `> ${CHROME.post[locale]} ${parent}`,
    "",
    // `Generated`, not `Last updated`: this is the build date, identical across
    // all 24 shards. Labelling it as the post's update date told every
    // recency-weighted pipeline that the whole corpus changed today. The real
    // dates are `Published:`/`Updated:` inside the entry.
    `> Generated: ${today()}`,
    "",
    ...buildPostEntry(post, siteUrl, localePrefix, locale),
  ].join("\n");
}

/**
 * Renders one locale's tools as `### title` blocks with metadata and body, for
 * llms-full.
 *
 * ── Why the body is inlined and not sharded like a post ───────────────────
 * A post body gets its own file because it is a self-contained 31–59 KB guide:
 * big enough that inlining twelve of them made the document 587 KB and any
 * ingestion cap landed mid-guide. A tool body is not that. Converted, the
 * largest is 9.1 KB and the median 4.6 KB — the whole 17-tool English corpus
 * (76.5 KB) is barely larger than one post shard. It is also not a document:
 * "How is the CRC-16 calculated?" is only useful next to the URL, category and
 * feature list of the tool that calculates it, and splitting the two would cost
 * a second fetch to reassemble a page that is 11 KB whole. Publishing a 2.2 KB
 * `.txt` per tool would apply the shard machinery to files it was never needed
 * for, and add 34 URLs to the index for it.
 *
 * The cost is honest: this takes the corpus from 76 KB to 153 KB and the
 * bilingual llms-full.txt from 117 KB to 282 KB, which pushes the CV and
 * Publications sections further down the document. The per-locale variants
 * exist for exactly the pipelines that care, and llms.txt already advertises
 * them on that basis.
 *
 * ── Why the whole body, chrome included ───────────────────────────────────
 * Roughly 8% of it is interface instructions ("click the + button"), and
 * another ~24% restates the description, feature list and privacy answer that
 * the frontmatter above already emitted, in different words. The remaining ~66%
 * is reference material that exists nowhere else in the corpus: Modbus function
 * and exception code tables, the JS/PCRE/Python regex flavour comparison, WCAG
 * contrast formulas, subnet tables, and a `Linux Command Reference` per tool.
 * Filtering the rest out would mean a converter deciding which of an author's
 * sections count as content, and the near-duplicate wording is a retrieval
 * annoyance, not a false statement.
 */
/**
 * Root-relative path of a page's markdown twin.
 *
 * The spec's own words: "pages with information that agents might need
 * provide a clean markdown version of those pages at the same URL as the
 * original page, either with `.md` appended (`page.html.md`) or with the
 * extension replaced by `.md` (`page.md`). (URLs without file names should
 * append `index.html.md` or `index.md` instead.)"
 *
 * Every page here ends in a slash and has no file name, so `index.md` is the
 * form that applies. The bare `<page>.md` shape this replaced is kept alive by
 * a redirect: it was advertised, and an agent that learned it should not meet
 * a 404.
 *
 * @param pagePath - Root-relative page URL, with its trailing slash.
 * @returns The twin's path.
 */
export function markdownTwinPath(pagePath: string): string {
  // String ops rather than `/\/+$/`: an anchored `+` over a run of the same
  // character is the backtracking shape SonarCloud flags, and the loop says
  // what it does.
  let base = pagePath;
  while (base.endsWith("/")) base = base.slice(0, -1);
  return `${base}/index.md`;
}

/**
 * The prose the generator writes around the content, per locale.
 *
 * Split from the field keys (`URL:`, `Published:`, `Tags:`…) on purpose. Those
 * are a schema: their values already carry the language, and what makes them
 * parseable is being identical across all 72 documents — the same reason
 * JSON-LD property names stay English whatever `inLanguage` says. These, by
 * contrast, are sentences, and a markdown file has no `lang` attribute and no
 * hreflang: its own text is the ONLY language signal it carries. English
 * chrome inside a Spanish document weakens precisely the signal that makes it
 * selectable as a Spanish source.
 */
const CHROME = {
  page: {
    en: "One page from jmrp.io, published as markdown. Index:",
    es: "Una página de jmrp.io, publicada como markdown. Índice:",
  },
  post: {
    en: "One post from jmrp.io, published as its own document. Index:",
    es: "Una entrada de jmrp.io, publicada como documento propio. Índice:",
  },
  questions: { en: "Questions answered:", es: "Preguntas que responde:" },
  features: { en: "Features:", es: "Características:" },
  steps: { en: "Steps", es: "Pasos" },
} as const;

/**
 * The same document in the other locale.
 *
 * This is the twin's hreflang. The page has `<link rel="alternate" hreflang>`;
 * the markdown file has nothing, so an agent holding the Spanish document had
 * no way to learn the English one exists, or the reverse. Structural parity
 * between locales is enforced elsewhere (identical slugs, identical FAQ
 * counts), which is what makes swapping the prefix a safe derivation.
 *
 * @param url - Absolute URL of the page this document twins.
 * @param locale - Locale of THIS document.
 * @returns Absolute URL of the other locale's twin.
 */
function alternateTwinUrl(url: string, locale: "en" | "es"): string {
  const { origin, pathname } = new URL(url);
  const other =
    locale === "es" ? pathname.replace("/es/", "/") : `/es${pathname}`;
  return `${origin}${markdownTwinPath(other)}`;
}

/**
 * Metadata block shared by every standalone markdown document.
 *
 * Exported because `@utils/llms/listing-markdown` builds the same header for
 * the listing twins; two copies is how the `Language:`/`Alternate:` schema
 * would drift between document families.
 *
 * @param title - Document title, rendered as the `# ` heading.
 * @param url - Absolute URL of the page this document twins.
 * @param index - Absolute URL of the index that covers it.
 * @param locale - Locale of THIS document.
 * @param extra - Further header lines, appended after the schema block.
 * @returns The header lines.
 */
export function documentHeader(
  title: string,
  url: string,
  index: string,
  locale: "en" | "es",
  extra: string[] = [],
): string[] {
  // `Updated:` is the CONTENT date, resolved from the same function that
  // answers for the sitemap's <lastmod> and for the page's JSON-LD
  // `dateModified`, so the three surfaces cannot disagree. Without it every
  // page twin carried only `Generated:` — the build clock, identical across
  // the whole corpus — while the HTML beside it declared a real date, and a
  // recency-weighted pipeline read the whole set as changed today.
  //
  // `Generated:` stays exactly what it is: the build date. Resolved here
  // rather than passed in through `extra` so a twin added later cannot omit
  // it, and omitted entirely when git cannot answer, because an absent
  // freshness signal is honest and a fabricated one is not.
  const modified = pageLastmod(stripLocalePrefix(new URL(url).pathname));
  return [
    `# ${title}`,
    "",
    `> ${CHROME.page[locale]} ${index}`,
    "",
    // The build date, not a content date — `Updated:` below is the real one.
    `> Generated: ${today()}`,
    "",
    `URL: ${url}`,
    // The keys stay English: they are the schema. The values are the language.
    `Language: ${locale}`,
    `Alternate: ${alternateTwinUrl(url, locale)}`,
    ...(modified ? [`Updated: ${modified.slice(0, 10)}`] : []),
    ...extra,
  ];
}

/**
 * The `featureList` and FAQ of a tool, rendered as markdown lines.
 *
 * Shared by the llms-full.txt entry and the tool's standalone twin because
 * both need exactly this, and a divergence between them would mean the index
 * advertised a tool differently from the document it points at. Both blocks
 * collapse to nothing when the frontmatter omits them.
 *
 * @param d - The tool's frontmatter.
 * @param locale - The tool's own language, not the caller's.
 * @returns Markdown lines, empty when the tool declares neither.
 */
function toolFeaturesAndFaq(
  d: CollectionEntry<"tools">["data"],
  locale: "en" | "es",
): string[] {
  return [
    ...(d.features && d.features.length > 0
      ? ["", CHROME.features[locale], ...d.features.map((f) => `- ${f}`)]
      : []),
    ...(d.faq && d.faq.length > 0
      ? [
          "",
          CHROME.questions[locale],
          "",
          ...d.faq.flatMap((f) => [`**${f.question}**`, "", f.answer, ""]),
        ]
      : []),
  ];
}

/** A tool's frontmatter as the `notes about the file` the index carries. */
function toolIndexEntry(
  t: CollectionEntry<"tools">,
  siteUrl: string,
): string[] {
  const d = t.data;
  // The entry's own language, not the caller's: llms-full.txt is one bilingual
  // index, so its Spanish half must read as Spanish inside an English file.
  const locale = d.lang;
  return [
    `### ${d.title}`,
    "",
    `URL: ${toolUrl(siteUrl, t)}`,
    `Markdown: ${siteUrl}${markdownTwinPath(new URL(toolUrl(siteUrl, t)).pathname)}`,
    `Category: ${d.category}`,
    ...(d.tags.length > 0 ? [`Tags: ${d.tags.join(", ")}`] : []),
    d.description,
    // Both of these already reach the page as JSON-LD — `featureList` on the
    // SoftwareApplication and a FAQPage — so withholding them from the text
    // corpus meant the machine-readable surface was richer than the one
    // written for machines. They stay in the index because they are what lets
    // an agent choose WHICH tool to fetch, which is the job of a file list.
    ...toolFeaturesAndFaq(d, locale),
    "",
  ];
}

/** Renders one locale's tools as `### title` blocks, for llms-full. */
function buildToolSection(
  tools: CollectionEntry<"tools">[],
  siteUrl: string,
): string[] {
  return tools.flatMap((t) => toolIndexEntry(t, siteUrl));
}

/**
 * One tool as a standalone markdown document.
 *
 * The body used to be inlined in `llms-full.txt`, where the 34 of them were
 * 82.5% of the file and pushed it past the point where a fetching agent
 * truncates. The spec's answer to exactly this is the sentence that ends its
 * proposal: "The file itself stays small enough to fit in context. The detail
 * lives behind the links, and is fetched only when needed."
 *
 * @param siteUrl - Absolute site origin.
 * @param tool - The tool entry.
 * @returns The complete file body.
 */
export function generateToolMarkdown(
  siteUrl: string,
  tool: CollectionEntry<"tools">,
): string {
  const d = tool.data;
  const locale = d.lang === "es" ? "es" : "en";
  const page = new URL(toolUrl(siteUrl, tool)).pathname;
  return [
    ...documentHeader(
      d.title,
      `${siteUrl}${page}`,
      `${siteUrl}/llms.txt`,
      locale,
      [
        `Category: ${d.category}`,
        ...(d.tags.length > 0 ? [`Tags: ${d.tags.join(", ")}`] : []),
        "",
        d.description,
      ],
    ),
    ...toolFeaturesAndFaq(d, locale),
    ...(tool.body
      ? ["", "---", "", mdxToMarkdown(tool.body, { locale, siteUrl, registry })]
      : []),
    "",
  ].join("\n");
}

/**
 * The publications list as markdown lines.
 *
 * @param groups - Publication groups from the BibTeX source.
 * @returns Markdown lines.
 */
function publicationsLines(groups: PublicationGroup[]): string[] {
  return groups.flatMap((group) => [
    // H2, not H3 — same fix as `cvToMarkdown`. `# Publications` is the line
    // above, so H3 here left the document with no H2 at all.
    `## ${group.title}`,
    "",
    ...group.items.map((pub) => {
      const authors = (pub.author ?? [])
        .map((a) => (a.given ? `${a.given} ${a.family}` : a.family))
        .join(", ");
      const year = pub.issued?.["date-parts"]?.[0]?.[0];
      const venueRaw = pub["container-title"] ?? pub.publisher;
      const venue = stripTrailingPunctuation(
        typeof venueRaw === "string" ? venueRaw : "",
      ).trim();
      // The abstract is the only part of a paper that lets a model answer a
      // question ABOUT the research rather than merely cite its title.
      const abstract =
        typeof pub.abstract === "string" ? pub.abstract.trim() : "";
      const doi = typeof pub.DOI === "string" ? pub.DOI.trim() : "";
      return [
        `- ${pub.title}${parenthetical(year ? String(year) : undefined)}${dashed(authors)}${suffixed(venue)}`,
        ...(doi ? [`  DOI: https://doi.org/${doi}`] : []),
        ...(abstract ? [`  Abstract: ${collapseWhitespace(abstract)}`] : []),
      ].join("\n");
    }),
    "",
  ]);
}

/**
 * The CV as a standalone markdown document.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Which locale's CV to render.
 * @returns The complete file body.
 */
export async function generateCvMarkdown(
  siteUrl: string,
  locale: "en" | "es",
): Promise<string> {
  const cv = await getCVData(locale);
  const page = `${locale === "es" ? "/es" : ""}/cv/`;
  return [
    ...documentHeader(
      cv.basics.name,
      `${siteUrl}${page}`,
      `${siteUrl}/llms.txt`,
      locale,
    ),
    "",
    ...cvToMarkdown(cv, siteUrl, locale),
    "",
  ].join("\n");
}

/**
 * The publications list as a standalone markdown document.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Locale of the page this twins.
 * @returns The complete file body.
 */
export async function generatePublicationsMarkdown(
  siteUrl: string,
  locale: "en" | "es",
): Promise<string> {
  // With the locale: `getPublications` groups by type and those titles are
  // translated, so the default made the Spanish twin carry "Journal articles"
  // while the page it mirrors says "Artículos de revista".
  const groups = await getPublications(locale);
  const page = `${locale === "es" ? "/es" : ""}/publications/`;
  return [
    ...documentHeader(
      locale === "es" ? "Publicaciones" : "Publications",
      `${siteUrl}${page}`,
      `${siteUrl}/llms.txt`,
      locale,
    ),
    "",
    ...publicationsLines(groups),
  ].join("\n");
}

/**
 * Turns the hero's inline HTML into markdown.
 *
 * `heroSubtitle` and `heroBio2` are the only translated strings that carry
 * markup, because the page renders them with `set:html`. Stripping the tags
 * would have been one line, but it drops the two links inside them — the
 * public MCP servers and the CV — which are exactly the paths an agent
 * reading this document should be able to follow. So the three tags that
 * actually occur are mapped, and anything else is stripped.
 *
 * @param html - The translated string, as authored.
 * @param siteUrl - Absolute site origin, to resolve root-relative hrefs.
 * @returns Markdown text.
 */
function heroToMarkdown(html: string, siteUrl: string): string {
  const withLinks = html
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll(/<(strong|b)>([^<]*)<\/\1>/gi, "**$2**")
    .replaceAll(/<(em|i)>([^<]*)<\/\1>/gi, "*$2*")
    .replaceAll(
      /<a\s[^>]*href=['"]([^'"]+)['"][^>]*>([^<]*)<\/a>/gi,
      (_m, href: string, text: string) =>
        `[${text}](${href.startsWith("/") ? siteUrl + href : href})`,
    );
  // `Engineer. <br>` leaves a trailing space before the newline. One trailing
  // space is not a markdown hard break (that needs two), just untidy bytes.
  return stripToText(withLinks)
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

/**
 * The homepage as a standalone markdown document.
 *
 * The page itself is orientation — who this is, and where everything lives —
 * so its twin is a map: the same hero identity, then every section with its
 * own twin listed beside it. An agent that lands here reaches the whole site
 * in markdown without parsing one page of HTML.
 *
 * The featured projects are named, not described. The page fetches their
 * descriptions and star counts from the GitHub API at build time; repeating
 * that here would put a second, independently-drifting copy of the same claim
 * in the corpus, and `/projects/` already publishes the detailed version.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Which locale.
 * @returns The complete file body.
 */
export async function generateHomeMarkdown(
  siteUrl: string,
  locale: "en" | "es",
): Promise<string> {
  const t = useTranslations(locale);
  const prefix = locale === "es" ? "/es" : "";
  const siteEntry = await getEntry("site_config", "site");
  const siteData = (siteEntry?.data ?? {}) as SiteConfig;

  const label = {
    sections: { en: "Sections", es: "Secciones" },
    featured: { en: "Featured projects", es: "Proyectos destacados" },
    latest: { en: "Latest posts", es: "Últimas entradas" },
    status: { en: "Status", es: "Estado" },
    role: { en: "Role", es: "Perfil" },
  } as const;

  const sections = HOME_SECTIONS.flatMap((section) => [
    `### ${section.title[locale]}`,
    "",
    `URL: ${siteUrl}${prefix}${section.path}`,
    ...(TWINNED_PAGES.has(section.path)
      ? [`Markdown: ${siteUrl}${markdownTwinPath(prefix + section.path)}`]
      : []),
    ...(section.note ? ["", section.note[locale]] : []),
    "",
  ]);

  // Newest first, which is the order the homepage shows them in.
  const posts = (await getPostsByLocale(locale)).slice(-5).toReversed();
  const latest = posts.flatMap((post) => {
    const path = `${prefix}/blog/${post.data.slug}/`;
    return [
      `- ${post.data.title}`,
      `  URL: ${siteUrl}${path}`,
      `  Markdown: ${siteUrl}${markdownTwinPath(path)}`,
    ];
  });

  const featured = (siteData.featured_projects ?? []).map(
    (name) => `- ${name} — https://github.com/jmrplens/${name}`,
  );

  return [
    ...documentHeader(
      t("pages.home.heroTitle"),
      `${siteUrl}${prefix}/`,
      `${siteUrl}/llms.txt`,
      locale,
      [
        `${label.status[locale]}: ${t("pages.home.availability")}`,
        `${label.role[locale]}: ${t("pages.home.terminalRole")}`,
      ],
    ),
    "",
    heroToMarkdown(t("pages.home.heroSubtitle"), siteUrl),
    "",
    heroToMarkdown(t("pages.home.heroBio1"), siteUrl),
    "",
    heroToMarkdown(t("pages.home.heroBio2"), siteUrl),
    "",
    `## ${label.sections[locale]}`,
    "",
    ...sections,
    `## ${label.featured[locale]}`,
    "",
    ...featured,
    "",
    `## ${label.latest[locale]}`,
    "",
    ...latest,
    "",
  ].join("\n");
}

/**
 * One of the three profile pages as a standalone markdown document.
 *
 * @param siteUrl - Absolute site origin.
 * @param page - Which page.
 * @param locale - Which locale.
 * @returns The complete file body.
 */
export async function generateProfileMarkdown(
  siteUrl: string,
  page: "about" | "projects" | "uses",
  locale: "en" | "es",
): Promise<string> {
  const path = `${locale === "es" ? "/es" : ""}/${page}/`;
  const titles = {
    about: { en: "About", es: "Sobre mí" },
    projects: { en: "Projects", es: "Proyectos" },
    uses: { en: "Uses", es: "Uses" },
  } as const;
  const renderers = {
    about: aboutLines,
    uses: usesLines,
    projects: projectsLines,
  } as const;
  const lines = await renderers[page](locale);
  return [
    ...documentHeader(
      titles[page][locale],
      `${siteUrl}${path}`,
      `${siteUrl}/llms.txt`,
      locale,
    ),
    "",
    ...lines,
  ].join("\n");
}

/**
 * A prose page from the `pages` collection, as a standalone markdown document.
 *
 * These are MDX, so the body goes through the same converter every post uses —
 * which is half the reason the privacy policy stopped being 32 translation
 * keys: a document gets its twin for free, a string table never can.
 *
 * @param siteUrl - Absolute site origin.
 * @param slug - Page slug within the collection.
 * @param locale - Which locale.
 * @returns The complete file body.
 */
export async function generatePageMarkdown(
  siteUrl: string,
  slug: string,
  locale: "en" | "es",
): Promise<string> {
  const entry = await getEntry("pages", `${locale}/${slug}`);
  if (!entry) throw new Error(`Missing page: ${locale}/${slug}`);
  const path = `${locale === "es" ? "/es" : ""}/${slug}/`;
  return [
    ...documentHeader(
      entry.data.heading,
      `${siteUrl}${path}`,
      `${siteUrl}/llms.txt`,
      locale,
      ["", entry.data.description],
    ),
    "",
    mdxToMarkdown(entry.body ?? "", { locale, siteUrl, registry }),
  ].join("\n");
}

/** Generates the enriched `llms-full.txt` with per-post detail. */
export async function generateLlmsFullTxt(siteUrl: string): Promise<string> {
  const siteEntry = await getEntry("site_config", "site");
  const siteData = (siteEntry?.data ?? {}) as SiteConfig;
  const postsEn = await getPostsByLocale("en");
  const postsEs = await getPostsByLocale("es");
  const toolsEn = await getToolsByLocale("en");
  const toolsEs = await getToolsByLocale("es");
  // Post bodies are NOT inlined any more — see llmsPostShardPath(). What goes
  // in here is a link index; the bodies are one file per post.
  const postSectionEn = buildPostIndex(postsEn, siteUrl, "en");
  const postSectionEs = buildPostIndex(postsEs, siteUrl, "es");
  const toolSectionEn = buildToolSection(toolsEn, siteUrl);
  const toolSectionEs = buildToolSection(toolsEs, siteUrl);

  const lines = [
    "# jmrp.io — Full Context",
    "",
    `> ${DESCRIPTION}`,
    "",
    "> This file is an index. Every entry links to a markdown twin that carries\n> the detail, which is what keeps the index itself small enough to fit in an\n> agent's context. Posts, tools, the CV and the publications each live at\n> their page's own URL with `index.md` appended.",
    "",
    // The build date, not a content date — see the same label on the shards.
    `> Generated: ${today()}`,
    "",
    "## About the Author",
    "",
    ABOUT,
    "",
    // Locale sections are omitted entirely rather than emitted empty when the
    // document is scoped, so a per-locale file has no dangling headings.
    "## Blog Posts",
    "",
    ...postSectionEn,
    "## Blog Posts (Español)",
    "",
    ...postSectionEs,
    "## Developer Tools",
    "",
    ...toolSectionEn,
    "## Developer Tools (Español)",
    "",
    ...toolSectionEs,
    // Linked, not inlined, for the same reason the post bodies are: this file
    // has to stay inside a fetching agent's context, and these two were 35 KB
    // of a document already past the point where one truncates it.
    "## Curriculum Vitae",
    "",
    `- [Curriculum Vitae](${siteUrl}${markdownTwinPath("/cv/")}): full CV in markdown ([page](${siteUrl}/cv/))`,
    `- [Currículum](${siteUrl}${markdownTwinPath("/es/cv/")}): CV completo en markdown ([página](${siteUrl}/es/cv/))`,
    "",
    "## Publications",
    "",
    `- [Publications](${siteUrl}${markdownTwinPath("/publications/")}): every paper with its abstract and DOI ([page](${siteUrl}/publications/))`,
    `- [Publicaciones](${siteUrl}${markdownTwinPath("/es/publications/")}): cada artículo con su resumen y DOI ([página](${siteUrl}/es/publications/))`,
    "",
    // The sections llms.txt advertises but this file used to skip — in BOTH
    // languages. `buildProfileSections` always took a locale and was only ever
    // called with "en", so /es/projects/ and /es/uses/ appeared nowhere in the
    // corpus even though their twins had been published for months.
    ...buildProfileSections(siteUrl, "en"),
    ...buildProfileSections(siteUrl, "es"),
    // Per-locale like the post/tool sections: the combined document carries
    // both languages, each per-locale variant only its own.
    await mcpBlock("en"),
    "",
    await mcpBlock("es"),
    "",
    "## Contact",
    "",
    ...(await contactLines(siteData)).map((c) => `- ${c}`),
    "",
    "## Technical Details",
    "",
    ...TECHNICAL_DETAILS.map((d) => `- ${d}`),
    "",
  ];

  return lines.join("\n");
}
