/**
 * llms.txt / llms-full.txt generators (llmstxt.org standard).
 *
 * Both files are generated from the content collections (posts, tools) so they
 * stay in sync with the site automatically — no hand maintenance. `llms.txt` is
 * a concise link index; `llms-full.txt` enriches each post with its description,
 * tags, FAQ questions, and HowTo step names (all sourced from frontmatter).
 */
import { type TranslationKey, useTranslations } from "@i18n/utils";
import { getCVData } from "@utils/cv";
import { getMcpServers, type McpServer } from "@utils/projects";
import { getPublications, stripTrailingPunctuation } from "@utils/publications";
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
        "Includes: gitlab-mcp-server (Model Context Protocol server exposing over 1,000 GitLab operations to AI assistants, Go), phonometry (Python acoustics library validated against 362 published standards), cs-routeros-bouncer (CrowdSec bouncer for MikroTik RouterOS, Go), Cloudflare-DNS-Updater (dynamic DNS updater), libgen-mcp, and TFG-TFM_EPS (LaTeX thesis template for the Universitat Politècnica de València).",
        "Both MCP servers also run as public hosted endpoints at mcp.jmrp.io, so a client can call them without building or installing anything.",
      ],
    },
    es: {
      title: "Proyectos",
      lines: [
        "Software de código abierto escrito y mantenido por el autor; cada entrada indica lenguaje, licencia, repositorio de código y sitio de documentación.",
        "Incluye: gitlab-mcp-server (servidor Model Context Protocol que expone más de 1.000 operaciones de GitLab a asistentes de IA, en Go), phonometry (biblioteca de acústica en Python validada contra 362 normas publicadas), cs-routeros-bouncer (bouncer de CrowdSec para MikroTik RouterOS, en Go), Cloudflare-DNS-Updater (actualizador de DNS dinámico), libgen-mcp y TFG-TFM_EPS (plantilla LaTeX de tesis para la Universitat Politècnica de València).",
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
        "Services include a Mastodon instance (mstdn.jmrp.io), a Matrix homeserver, an AT Protocol PDS, Nextcloud, Jellyfin, and monitoring.",
        "Model Context Protocol servers are published at mcp.jmrp.io, running on the same infrastructure: libgen (no credentials) and gitlab (per-request token).",
        "Tor: four nodes — two bridges running obfs4 and WebTunnel, one in Valencia and one in Alicante, and two middle relays on IONOS VPS instances, one in London and one in Madrid.",
        "Security pipeline: a MikroTik honeypot and nginx pattern matching feed CrowdSec, which drives bouncers on the router and the web tier.",
      ],
    },
    es: {
      title: "Homelab",
      lines: [
        "Infraestructura autoalojada que el autor opera sobre su propio hardware y sus propias conexiones, con métricas en tiempo real en la página.",
        "Entre los servicios hay una instancia de Mastodon (mstdn.jmrp.io), un homeserver de Matrix, un PDS de AT Protocol, Nextcloud, Jellyfin y monitorización.",
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
function buildProfileSections(
  siteUrl: string,
  locale: "en" | "es" = "en",
): string[] {
  return PROFILE_SECTIONS.flatMap((section) => {
    const localized = locale === "es" ? section.es : section.en;
    return [
      `## ${localized.title}`,
      "",
      `URL: ${siteUrl}${locale === "es" ? "/es" : ""}${section.url}`,
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
 * Best-effort conversion of a post's MDX body to plain-ish markdown for AI
 * ingestion: strips `import` statements, collapses excess blank lines, and
 * demotes the post's own headings by two levels.
 *
 * The demotion matters: post bodies are inlined under an `### <post title>`
 * node, so their native `##` sections would otherwise sit one level ABOVE the
 * title they belong to. Any retrieval pipeline that chunks on H2 boundaries
 * would then detach every section from its article and lose attribution.
 *
 * Fenced code blocks are skipped — a leading `#` there is a shell comment, not
 * a heading, and rewriting it would corrupt the snippet. Component tags are
 * left in place (harmless noise) to avoid corrupting code blocks that
 * legitimately contain `<` / `>`.
 */
function mdxToText(body: string): string {
  // EVERY transform here runs inside one fence-aware pass, deliberately.
  // Each one that was hoisted out of it corrupted snippets: stripping `import`
  // up front deleted the `import csv` / `import os` lines from the Python
  // sample in post 010, and collapsing blank runs up front squashed the
  // spacing inside code blocks. Both shipped broken code to the very consumer
  // llms-full.txt exists for. Nothing may touch a line while `inFence`.
  let inFence = false;
  let blankRun = 0;
  const out: string[] = [];

  for (const line of body.trim().split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      blankRun = 0;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    // MDX component imports are page scaffolding, not prose. Dropping the line
    // outright (rather than emitting "") keeps the import block from turning
    // into a run of blank lines.
    if (line.startsWith("import ")) continue;

    // Collapse runs of blank lines to at most one, outside fences only.
    if (line.trim() === "") {
      blankRun += 1;
      if (blankRun > 1) continue;
      out.push(line);
      continue;
    }
    blankRun = 0;

    // `\s` matches exactly one character and the remainder is taken with
    // slice() rather than a second capture group: `(\s+.*)` lets both parts
    // consume whitespace, so the engine backtracks over every split of a
    // long run of spaces (super-linear, flagged by SonarCloud as ReDoS).
    const match = /^(#{1,4})\s/.exec(line);
    if (!match) {
      out.push(line);
      continue;
    }
    // Cap at H6 so deeply nested source headings stay valid markdown.
    const depth = Math.min(match[1].length + 2, 6);
    out.push(`${"#".repeat(depth)}${line.slice(match[1].length)}`);
  }

  return out.join("\n");
}

/**
 * Flattens the structured CV data (a discriminated union of section types) into
 * a readable list of human-facing strings — section titles, institutions,
 * summaries, skill and certificate names — skipping icons, links and levels.
 * Type-agnostic so it survives schema changes.
 */
function cvToText(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    const s = node.trim();
    if (s && !s.startsWith("i-") && !/^https?:\/\//.test(s)) out.push(s);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) cvToText(item, out);
    return out;
  }
  if (node && typeof node === "object") {
    const skip = new Set(["icon", "link", "url", "image", "level", "type"]);
    for (const [key, value] of Object.entries(node)) {
      if (!skip.has(key)) cvToText(value, out);
    }
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
    `- [Privacy](${siteUrl}/privacy/): What the site measures — self-hosted analytics beacon, no cookies, no third-party requests, no ads`,
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
    `- [Privacidad](${siteUrl}/es/privacy/): Qué mide el sitio — beacon de analítica autoalojado, sin cookies, sin peticiones a terceros, sin anuncios`,
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
    `For comprehensive context including blog post topics, FAQs, and tool features, see [llms-full.txt](${siteUrl}/llms-full.txt).`,
    "",
    "## About",
    "",
    ABOUT,
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
    ...postsEn.map(
      (p) =>
        `- [${p.data.title}](${siteUrl}/blog/${p.data.slug}/)${
          p.data.description ? `: ${p.data.description}` : ""
        }`,
    ),
    "",
    "## Blog Posts (Español)",
    "",
    ...postsEs.map(
      (p) =>
        `- [${p.data.title}](${siteUrl}/es/blog/${p.data.slug}/)${
          p.data.description ? `: ${p.data.description}` : ""
        }`,
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
    "## Technical Details",
    "",
    ...TECHNICAL_DETAILS.map((d) => `- ${d}`),
    "",
    "## Optional",
    "",
    `- [Person entity (JSON-LD)](${siteUrl}/identity/person.jsonld): Machine-readable identity node for the author`,
    `- [Full context](${siteUrl}/llms-full.txt): Every post and tool expanded, both languages in one document (~1.2 MB)`,
    `- [Full context, English only](${siteUrl}/llms-full-en.txt): The same document scoped to the English corpus, for pipelines that cap document size`,
    `- [Full context, Spanish only](${siteUrl}/llms-full-es.txt): The same document scoped to the Spanish corpus`,
    `- [RSS feed (EN)](${siteUrl}/rss.xml): English blog feed`,
    `- [RSS feed (ES)](${siteUrl}/es/rss.xml): Spanish blog feed`,
    "",
  ];
  return lines.join("\n");
}

/**
 * Path of the per-post shard for a locale, relative to the site root.
 *
 * Post bodies live in their own file rather than inlined in `llms-full*.txt`:
 * the twelve English posts alone were 557 KB of a 587 KB document (94.8%), so
 * any cap an ingestion pipeline applies lands in the middle of a post. One file
 * per post is naturally bounded — the largest is 62 KB — and lets an agent
 * fetch exactly the guide it needs instead of the whole corpus.
 *
 * @param locale - Post locale.
 * @param slug - Post slug, already carrying its `NNN-` prefix.
 * @returns Root-relative path, e.g. `/llms-blog-en-003-….txt`.
 */
export function llmsPostShardPath(locale: "en" | "es", slug: string): string {
  return `/llms-blog-${locale}-${slug}.txt`;
}

/** Renders a single post as the `### title` block used by llms-full and shards. */
function buildPostEntry(
  p: CollectionEntry<"posts">,
  siteUrl: string,
  localePrefix: "" | "/es",
): string[] {
  const d = p.data;
  return [
    `### ${d.title}`,
    "",
    `URL: ${siteUrl}${localePrefix}/blog/${d.slug}/`,
    `Type: ${d.articleType}`,
    ...(d.description ? [`Summary: ${d.description}`] : []),
    ...(d.tags.length > 0 ? [`Tags: ${d.tags.join(", ")}`] : []),
    ...(d.faq && d.faq.length > 0
      ? ["", "Questions answered:", ...d.faq.map((f) => `- ${f.question}`)]
      : []),
    ...((d.howto?.steps?.length ?? 0) > 0
      ? [
          "",
          `Steps (${d.howto?.name}):`,
          ...(d.howto?.steps ?? []).map((s, i) => `${i + 1}. ${s.name}`),
        ]
      : []),
    ...(p.body ? ["", "---", "", mdxToText(p.body)] : []),
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
    ...posts.map((p) => {
      const d = p.data;
      const url = `${siteUrl}${llmsPostShardPath(locale, d.slug)}`;
      const summary = d.description ? `: ${d.description}` : "";
      return `- [${d.title}](${url})${summary}`;
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
    `> Last updated: ${today()}`,
    "",
    ...buildPostEntry(post, siteUrl, localePrefix),
  ].join("\n");
}

/** Renders one locale's tools as `### title` blocks with metadata, for llms-full. */
function buildToolSection(
  tools: CollectionEntry<"tools">[],
  siteUrl: string,
): string[] {
  return tools.flatMap((t) => [
    `### ${t.data.title}`,
    "",
    `URL: ${toolUrl(siteUrl, t)}`,
    `Category: ${t.data.category}`,
    t.data.description,
    "",
  ]);
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
  const cv = await getCVData();
  const publicationGroups = await getPublications();

  const cvSection = cvToText(cv).map((line) => `- ${line}`);

  const publicationsSection = publicationGroups.flatMap((group) => [
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
      const yearPart = year ? ` (${year})` : "";
      const authorPart = authors ? ` — ${authors}` : "";
      const venuePart = venue ? `. ${venue}` : "";
      // The abstract is the only part of a paper that lets a model answer a
      // question ABOUT the research rather than merely cite its title. This
      // section emitted the bibliographic line alone, so the 2,233 words of
      // abstracts rendered on /publications/ never reached the corpus written
      // for models (GEO audit 2026-08-22, M11). 14 of the 16 entries have one.
      // `PublicationItem` carries an index signature, hence the narrowing.
      const abstract =
        typeof pub.abstract === "string" ? pub.abstract.trim() : "";
      const doi = typeof pub.DOI === "string" ? pub.DOI.trim() : "";
      return [
        `- ${pub.title}${yearPart}${authorPart}${venuePart}.`,
        ...(doi ? [`  DOI: https://doi.org/${doi}`] : []),
        ...(abstract ? [`  Abstract: ${collapseWhitespace(abstract)}`] : []),
      ].join("\n");
    }),
    "",
  ]);

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
    '> Every section below is inlined in full except the blog posts, which are\n> one file per post so that no ingestion cap truncates mid-guide. The\n> "Blog Posts" section links to each of them.',
    "",
    `> Last updated: ${today()}`,
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
    "## Curriculum Vitae",
    "",
    ...cvSection,
    "",
    "## Publications",
    "",
    ...publicationsSection,
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
