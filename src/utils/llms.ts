/**
 * llms.txt / llms-full.txt generators (llmstxt.org standard).
 *
 * Both files are generated from the content collections (posts, tools) so they
 * stay in sync with the site automatically — no hand maintenance. `llms.txt` is
 * a concise link index; `llms-full.txt` enriches each post with its description,
 * tags, FAQ questions, and HowTo step names (all sourced from frontmatter).
 */
import { type TranslationKey, useTranslations } from "@i18n/utils";
import type { CVData } from "@src/types";
import { getCVData } from "@utils/cv";
import { registry } from "@utils/llms/mdx/registry";
import { mdxToMarkdown } from "@utils/llms/mdx/render";
import {
  aboutLines,
  projectsLines,
  usesLines,
} from "@utils/llms/profile-markdown";
import { getMcpServers, type McpServer } from "@utils/projects";
import {
  getPublications,
  type PublicationGroup,
  stripTrailingPunctuation,
} from "@utils/publications";
import { SERIES } from "@utils/series";
import type { CollectionEntry } from "astro:content";
import { getCollection } from "astro:content";

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

const CONTACT = [
  "[GitHub](https://github.com/jmrplens)",
  "[LinkedIn](https://www.linkedin.com/in/jmrplens)",
  "[Google Scholar](https://scholar.google.com/citations?user=9b0kPaUAAAAJ)",
  "[ORCID](https://orcid.org/0000-0003-1250-6212)",
  "[Mastodon](https://mstdn.jmrp.io/@jmrplens)",
  "[Email](mailto:mail@jmrp.io)",
];

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
 * Site sections that `llms.txt` advertises under "## Sections" but that
 * `llms-full.txt` used to omit entirely.
 *
 * The index promised Homelab, Projects, Uses and Privacy; the full document
 * expanded only About, Blog, Tools, CV and Publications, so a model that
 * followed the index into the full file found nothing for four of them —
 * including /privacy/, which carries some of the most quotable prose on the
 * site because its claims are falsifiable rather than promotional.
 *
 * Written as standing facts rather than generated from the pages: /homelab/'s
 * figures are live metrics that would be stale the moment they were written
 * into a static document, and stating a number here that the page no longer
 * shows would be worse than stating none.
 */
const PROFILE_SECTIONS: {
  url: string;
  en: { title: string; lines: string[] };
  es: { title: string; lines: string[] };
}[] = [
  {
    url: "/projects/",
    en: {
      title: "Projects",
      lines: [
        "Open-source software authored and maintained by the author, each entry listing language, license, source repository and documentation site.",
        "Includes: gitlab-mcp-server (Model Context Protocol server exposing over 1,000 GitLab operations to AI assistants, Go), phonometry (Python acoustics library validated against 367 standards), cs-routeros-bouncer (CrowdSec bouncer for MikroTik RouterOS, Go), Cloudflare-DNS-Updater (dynamic DNS updater), libgen-mcp, and TFG-TFM_EPS (LaTeX thesis template for the Universitat Politècnica de València).",
        "Both MCP servers also run as public hosted endpoints at mcp.jmrp.io, so a client can call them without building or installing anything.",
      ],
    },
    es: {
      title: "Proyectos",
      lines: [
        "Software de código abierto escrito y mantenido por el autor; cada entrada indica lenguaje, licencia, repositorio de código y sitio de documentación.",
        "Incluye: gitlab-mcp-server (servidor Model Context Protocol que expone más de 1.000 operaciones de GitLab a asistentes de IA, en Go), phonometry (biblioteca de acústica en Python validada contra 367 normas publicadas), cs-routeros-bouncer (bouncer de CrowdSec para MikroTik RouterOS, en Go), Cloudflare-DNS-Updater (actualizador de DNS dinámico), libgen-mcp y TFG-TFM_EPS (plantilla LaTeX de tesis para la Universitat Politècnica de València).",
        "Los dos servidores MCP corren además como endpoints públicos alojados en mcp.jmrp.io, así que un cliente puede llamarlos sin compilar ni instalar nada.",
      ],
    },
  },
  {
    url: "/homelab/",
    en: {
      title: "Homelab",
      lines: [
        "Self-hosted infrastructure run by the author on his own hardware and connections, with live metrics on the page.",
        "Services include a Mastodon instance (mstdn.jmrp.io), a Matrix homeserver, an AT Protocol PDS, Home Assistant, Immich, Jellyfin, and monitoring.",
        "Model Context Protocol servers are published at mcp.jmrp.io, running on the same infrastructure: libgen (no credentials) and gitlab (per-request token).",
        "Tor: four nodes — two bridges running obfs4 and WebTunnel, one in Valencia and one in Alicante, and two middle relays on IONOS VPS instances, one in London and one in Madrid.",
        "Security pipeline: a MikroTik honeypot and nginx pattern matching feed CrowdSec, which drives bouncers on the router and the web tier.",
      ],
    },
    es: {
      title: "Homelab",
      lines: [
        "Infraestructura autoalojada que el autor opera sobre su propio hardware y sus propias conexiones, con métricas en tiempo real en la página.",
        "Entre los servicios hay una instancia de Mastodon (mstdn.jmrp.io), un homeserver de Matrix, un PDS de AT Protocol, Home Assistant, Immich, Jellyfin y monitorización.",
        "Los servidores Model Context Protocol se publican en mcp.jmrp.io, sobre la misma infraestructura: libgen (sin credenciales) y gitlab (token por petición).",
        "Tor: cuatro nodos — dos puentes que ejecutan obfs4 y WebTunnel, uno en Valencia y otro en Alicante, y dos relays intermedios en VPS de IONOS, uno en Londres y otro en Madrid.",
        "Tubería de seguridad: un honeypot en MikroTik y la coincidencia de patrones de nginx alimentan a CrowdSec, que a su vez acciona los bouncers del router y de la capa web.",
      ],
    },
  },
  {
    url: "/uses/",
    en: {
      title: "Uses",
      lines: [
        "The hardware, software and services actually in rotation: router and network gear, servers and mini PCs, development tools, and the self-hosted services listed under Homelab.",
      ],
    },
    es: {
      title: "Uses",
      lines: [
        "El hardware, el software y los servicios que están realmente en uso: router y equipamiento de red, servidores y mini PCs, herramientas de desarrollo y los servicios autoalojados que aparecen en Homelab.",
      ],
    },
  },
  {
    url: "/privacy/",
    en: {
      title: "Privacy",
      lines: [
        "No cookies, no third-party scripts, no advertising network, no cross-site tracking, and no mailing list.",
        "The only measurement is a privacy-preserving analytics beacon; the page invites the reader to verify the claim directly by opening the browser storage panel and finding nothing to delete.",
        "Nothing on the site is monetized: no advertising, no affiliate links and no sponsored content, stated explicitly as a conflict-of-interest declaration.",
      ],
    },
    es: {
      title: "Privacidad",
      lines: [
        "Sin cookies, sin scripts de terceros, sin red publicitaria, sin rastreo entre sitios y sin lista de correo.",
        "La única medición es un beacon de analítica respetuoso con la privacidad; la página invita a comprobarlo abriendo el panel de almacenamiento del navegador y no encontrando nada que borrar.",
        "Nada del sitio está monetizado: ni publicidad, ni enlaces de afiliado, ni contenido patrocinado, declarado explícitamente como conflicto de intereses.",
      ],
    },
  },
];

/**
 * Renders {@link PROFILE_SECTIONS} as llms-full.txt blocks.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Which language to render, matching the document being built.
 *   Without this the Spanish document carried English profile prose under
 *   Spanish section headings, which is worse than omitting it.
 * @returns Markdown lines, ready to splice into the document.
 */
/** Profile pages that have a generated markdown twin. */
const TWINNED_PROFILE_PAGES = new Set(["/projects/", "/uses/"]);

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
      ...(TWINNED_PROFILE_PAGES.has(section.url)
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
  },
  es: {
    location: "Ubicación",
    availability: "Disponibilidad",
    email: "Correo",
    links: "Enlaces",
    department: "Departamento",
    period: "Periodo",
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

  const b = cv.basics;
  const out: string[] = [
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

  for (const section of cv.sections) {
    out.push(`### ${section.title}`, "");
    // The cast re-links section to its own branch: TypeScript narrows the
    // union on `section.kind` but cannot narrow the lookup that follows.
    const render = CV_SECTION_BODY[section.kind] as (
      s: typeof section,
      c: CvContext,
    ) => string[];
    out.push(...render(section, ctx));
  }
  return out;
}

/** Published posts for one locale, ordered by numbered slug (chronological). */
async function getPostsByLocale(lang: "en" | "es") {
  const posts = await getCollection(
    "posts",
    (p) => p.data.lang === lang && !p.data.draft,
  );
  return posts.sort((a, b) => a.data.slug.localeCompare(b.data.slug));
}

/** Tools for one locale, alphabetical within that locale. */
async function getToolsByLocale(lang: "en" | "es") {
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
  return [
    heading,
    "",
    `- [${t("series.ui.indexTitle")}](${siteUrl}${prefix}/blog/series/): ${t(
      "series.ui.indexDescription",
    )}`,
    // The slug is only known at runtime, so the key is cast — the same
    // pattern SeriesPage.astro uses for `series.<slug>.*`.
    ...SERIES.map(({ slug }) => {
      const title = t(`series.${slug}.title` as TranslationKey);
      const description = t(`series.${slug}.description` as TranslationKey);
      return `- [${title}](${siteUrl}${prefix}/blog/series/${slug}/): ${description}`;
    }),
  ].join("\n");
}

function sectionsBlock(siteUrl: string): string {
  return [
    "## Sections",
    "",
    `- [Blog](${siteUrl}/blog/): Technical articles on Nginx, MikroTik, networking, security, embedded firmware, and DevOps`,
    `- [About](${siteUrl}/about/): Who José Manuel Requena Plens is — firmware & software engineer, background, and featured open-source projects`,
    `- [CV](${siteUrl}/cv/): Professional curriculum vitae and experience`,
    `- [Publications](${siteUrl}/publications/): Academic papers on acoustics, metamaterials, and ultrasound`,
    `- [Homelab](${siteUrl}/homelab/): Self-hosted infrastructure — Mastodon, Matrix, AT Protocol PDS, MCP servers, Tor relays`,
    `- [Projects](${siteUrl}/projects/): Curated open-source software he authors and maintains — MCP servers, acoustics tooling, network security; language, license, source and docs per project`,
    `- [Tools](${siteUrl}/tools/): Free browser-based developer tools; all run in the browser except the certificate inspector and HTTP header analyzer, which fetch the target you ask them to inspect`,
    `- [Uses](${siteUrl}/uses/): Hardware, software, and homelab kept in rotation`,
    `- [Privacy](${siteUrl}/privacy/): What the site measures — self-hosted analytics beacon, no cookies, no ads; rendering a page needs no third-party host, and the beacon posts one aggregate event to Cloudflare`,
  ].join("\n");
}

/**
 * The same section map under `/es/`.
 *
 * Posts and tools were already listed in both languages, but `## Sections` was
 * English-only, so none of the nine Spanish landing pages — including the ES
 * homepage — appeared anywhere in the index. Every one of them exists and is
 * in the sitemap.
 */
function sectionsBlockEs(siteUrl: string): string {
  return [
    "## Sections (Español)",
    "",
    `- [Inicio](${siteUrl}/es/): Versión en español del sitio completo`,
    `- [Blog](${siteUrl}/es/blog/): Artículos técnicos sobre Nginx, MikroTik, redes, seguridad, firmware embebido y DevOps`,
    `- [Perfil](${siteUrl}/es/about/): Quién es José Manuel Requena Plens — ingeniero de firmware y software, trayectoria y proyectos destacados`,
    `- [CV](${siteUrl}/es/cv/): Currículum profesional y experiencia`,
    `- [Publicaciones](${siteUrl}/es/publications/): Artículos académicos sobre acústica, metamateriales y ultrasonidos`,
    `- [Homelab](${siteUrl}/es/homelab/): Infraestructura autoalojada — Mastodon, Matrix, PDS de AT Protocol, servidores MCP, relés Tor`,
    `- [Proyectos](${siteUrl}/es/projects/): Software libre que escribe y mantiene — servidores MCP, herramientas de acústica, seguridad de red`,
    `- [Herramientas](${siteUrl}/es/tools/): Herramientas gratuitas que se ejecutan en el navegador, salvo el inspector de certificados y el analizador de cabeceras HTTP, que consultan el destino que les indiques`,
    `- [Uses](${siteUrl}/es/uses/): Hardware, software e infraestructura en uso`,
    `- [Privacidad](${siteUrl}/es/privacy/): Qué mide el sitio — beacon de analítica autoalojado, sin cookies, sin anuncios; renderizar una página no requiere ningún host de terceros, y el beacon envía un evento agregado a Cloudflare`,
  ].join("\n");
}

/** Generates the concise `llms.txt` index. */
export async function generateLlmsTxt(siteUrl: string): Promise<string> {
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
    sectionsBlock(siteUrl),
    "",
    sectionsBlockEs(siteUrl),
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
    ...toolsEn.map(
      (t) =>
        `- [${t.data.title}](${toolUrl(siteUrl, t)}): ${t.data.description}`,
    ),
    "",
    "## Developer Tools (Español)",
    "",
    ...toolsEs.map(
      (t) =>
        `- [${t.data.title}](${toolUrl(siteUrl, t)}): ${t.data.description}`,
    ),
    "",
    // Both languages, like every other section of this bilingual index.
    await mcpBlock("en"),
    "",
    await mcpBlock("es"),
    "",
    "## Contact",
    "",
    ...CONTACT.map((c) => `- ${c}`),
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
): string[] {
  const d = p.data;
  return [
    // No `### <title>` here: the only caller is the shard, whose `# <title>`
    // header names the post one line above. Emitting both put the article
    // title in the document twice and pushed every real section down a level.
    `URL: ${siteUrl}${localePrefix}/blog/${d.slug}/`,
    `Type: ${d.articleType}`,
    `Published: ${d.publishedDate.toISOString().slice(0, 10)}`,
    ...(d.updatedDate
      ? [`Updated: ${d.updatedDate.toISOString().slice(0, 10)}`]
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
          "Questions answered:",
          "",
          ...d.faq.flatMap((f) => [`**${f.question}**`, "", f.answer, ""]),
        ]
      : []),
    ...((d.howto?.steps?.length ?? 0) > 0
      ? [
          "",
          `Steps (${d.howto?.name}):`,
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
  const parent = `${siteUrl}/llms-full-${locale}.txt`;
  return [
    `# ${post.data.title}`,
    "",
    `> One post from jmrp.io, published as its own document. Index: ${parent}`,
    "",
    // `Generated`, not `Last updated`: this is the build date, identical across
    // all 24 shards. Labelling it as the post's update date told every
    // recency-weighted pipeline that the whole corpus changed today. The real
    // dates are `Published:`/`Updated:` inside the entry.
    `> Generated: ${today()}`,
    "",
    ...buildPostEntry(post, siteUrl, localePrefix),
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

/** Metadata block shared by every standalone markdown document. */
function documentHeader(
  title: string,
  url: string,
  index: string,
  extra: string[] = [],
): string[] {
  return [
    `# ${title}`,
    "",
    `> One page from jmrp.io, published as markdown. Index: ${index}`,
    "",
    // The build date, not a content date — the real ones, when a page has
    // them, are in `extra`.
    `> Generated: ${today()}`,
    "",
    `URL: ${url}`,
    ...extra,
  ];
}

/** A tool's frontmatter as the `notes about the file` the index carries. */
function toolIndexEntry(
  t: CollectionEntry<"tools">,
  siteUrl: string,
): string[] {
  const d = t.data;
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
    ...(d.features && d.features.length > 0
      ? ["", "Features:", ...d.features.map((f) => `- ${f}`)]
      : []),
    ...(d.faq && d.faq.length > 0
      ? [
          "",
          "Questions answered:",
          "",
          ...d.faq.flatMap((f) => [`**${f.question}**`, "", f.answer, ""]),
        ]
      : []),
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
    ...documentHeader(d.title, `${siteUrl}${page}`, `${siteUrl}/llms.txt`, [
      `Category: ${d.category}`,
      ...(d.tags.length > 0 ? [`Tags: ${d.tags.join(", ")}`] : []),
      "",
      d.description,
    ]),
    ...(d.features && d.features.length > 0
      ? ["", "Features:", ...d.features.map((f) => `- ${f}`)]
      : []),
    ...(d.faq && d.faq.length > 0
      ? [
          "",
          "Questions answered:",
          "",
          ...d.faq.flatMap((f) => [`**${f.question}**`, "", f.answer, ""]),
        ]
      : []),
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
    `### ${group.title}`,
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
  const groups = await getPublications();
  const page = `${locale === "es" ? "/es" : ""}/publications/`;
  return [
    ...documentHeader(
      "Publications",
      `${siteUrl}${page}`,
      `${siteUrl}/llms.txt`,
    ),
    "",
    ...publicationsLines(groups),
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
    ),
    "",
    ...lines,
  ].join("\n");
}

/** Generates the enriched `llms-full.txt` with per-post detail. */
export async function generateLlmsFullTxt(
  siteUrl: string,
  /**
   * Restrict the document to one locale's posts and tools.
   *
   * Several AI ingestion pipelines cap a single document and truncate silently,
   * and because the Spanish corpus is emitted after the English one, the half
   * that gets dropped was always the same half. Two things address that: the
   * per-locale variants, and — since post bodies moved to one file per post —
   * this document being an index rather than the corpus itself. It went from
   * ~1.2 MB combined to a few tens of KB.
   */
  onlyLocale?: "en" | "es",
): Promise<string> {
  const wantEn = onlyLocale !== "es";
  const wantEs = onlyLocale !== "en";
  const postsEn = wantEn ? await getPostsByLocale("en") : [];
  const postsEs = wantEs ? await getPostsByLocale("es") : [];
  const toolsEn = wantEn ? await getToolsByLocale("en") : [];
  const toolsEs = wantEs ? await getToolsByLocale("es") : [];
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
    ...(wantEn ? ["## Blog Posts", "", ...postSectionEn] : []),
    ...(wantEs ? ["## Blog Posts (Español)", "", ...postSectionEs] : []),
    ...(wantEn ? ["## Developer Tools", "", ...toolSectionEn] : []),
    ...(wantEs ? ["## Developer Tools (Español)", "", ...toolSectionEs] : []),
    // Linked, not inlined, for the same reason the post bodies are: this file
    // has to stay inside a fetching agent's context, and these two were 35 KB
    // of a document already past the point where one truncates it.
    "## Curriculum Vitae",
    "",
    ...(wantEn
      ? [
          `- [Curriculum Vitae](${siteUrl}${markdownTwinPath("/cv/")}): full CV in markdown ([page](${siteUrl}/cv/))`,
        ]
      : []),
    ...(wantEs
      ? [
          `- [Currículum](${siteUrl}${markdownTwinPath("/es/cv/")}): CV completo en markdown ([página](${siteUrl}/es/cv/))`,
        ]
      : []),
    "",
    "## Publications",
    "",
    ...(wantEn
      ? [
          `- [Publications](${siteUrl}${markdownTwinPath("/publications/")}): every paper with its abstract and DOI ([page](${siteUrl}/publications/))`,
        ]
      : []),
    ...(wantEs
      ? [
          `- [Publicaciones](${siteUrl}${markdownTwinPath("/es/publications/")}): cada artículo con su resumen y DOI ([página](${siteUrl}/es/publications/))`,
        ]
      : []),
    "",
    // The four sections llms.txt advertises but this file used to skip.
    ...buildProfileSections(siteUrl, onlyLocale === "es" ? "es" : "en"),
    // Per-locale like the post/tool sections: the combined document carries
    // both languages, each per-locale variant only its own.
    ...(wantEn ? [await mcpBlock("en"), ""] : []),
    ...(wantEs ? [await mcpBlock("es"), ""] : []),
    "## Contact",
    "",
    ...CONTACT.map((c) => `- ${c}`),
    "",
    "## Technical Details",
    "",
    ...TECHNICAL_DETAILS.map((d) => `- ${d}`),
    "",
  ];

  return lines.join("\n");
}
