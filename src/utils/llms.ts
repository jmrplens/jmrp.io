/**
 * llms.txt / llms-full.txt generators (llmstxt.org standard).
 *
 * Both files are generated from the content collections (posts, tools) so they
 * stay in sync with the site automatically — no hand maintenance. `llms.txt` is
 * a concise link index; `llms-full.txt` enriches each post with its description,
 * tags, FAQ questions, and HowTo step names (all sourced from frontmatter).
 */
import { getCVData } from "@utils/cv";
import { getPublications, stripTrailingPunctuation } from "@utils/publications";
import type { CollectionEntry } from "astro:content";
import { getCollection } from "astro:content";

/** Curated, site-level narrative reused by both files. */
const DESCRIPTION =
  "Personal technical blog and portfolio of José Manuel Requena Plens — R&D Engineer specializing in Embedded Systems, Acoustics, and Industrial Software Development.";

const ABOUT =
  "José Manuel Requena Plens (JMRP) is a multidisciplinary engineer working across firmware, embedded systems, and applied research. Background in solar-inverter firmware and industrial control systems, Acoustics research, noise mitigation for the European Space Agency (ESA), and biomedical ultrasound at UPV. Active open source contributor and self-hoster.";

const CONTACT = [
  "GitHub: https://github.com/jmrplens",
  "LinkedIn: https://www.linkedin.com/in/jmrplens",
  "Google Scholar: https://scholar.google.com/citations?user=9b0kPaUAAAAJ",
  "ORCID: https://orcid.org/0000-0003-1250-6212",
  "Mastodon: https://mstdn.jmrp.io/@jmrplens",
  "Email: mail@jmrp.io",
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
  const stripped = body
    .replaceAll(/^import [^\n]*/gm, "")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();

  let inFence = false;
  return stripped
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const match = /^(#{1,4})(\s+.*)$/.exec(line);
      if (!match) return line;
      // Cap at H6 so deeply nested source headings stay valid markdown.
      const depth = Math.min(match[1].length + 2, 6);
      return `${"#".repeat(depth)}${match[2]}`;
    })
    .join("\n");
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

function sectionsBlock(siteUrl: string): string {
  return [
    "## Sections",
    "",
    `- [Blog](${siteUrl}/blog/): Technical articles on Nginx, MikroTik, networking, security, embedded firmware, and DevOps`,
    `- [About](${siteUrl}/about/): Who José Manuel Requena Plens is — firmware & software engineer, background, and featured open-source projects`,
    `- [CV](${siteUrl}/cv/): Professional curriculum vitae and experience`,
    `- [Publications](${siteUrl}/publications/): Academic papers on acoustics, metamaterials, and ultrasound`,
    `- [Homelab](${siteUrl}/homelab/): Self-hosted infrastructure — Mastodon, Matrix, AT Protocol PDS, Tor relays`,
    `- [Projects](${siteUrl}/projects/): Curated open-source software he authors and maintains — MCP servers, acoustics tooling, network security; language, license, source and docs per project`,
    `- [Tools](${siteUrl}/tools/): Free browser-based developer tools (privacy-first, no server calls)`,
    `- [Uses](${siteUrl}/uses/): Hardware, software, and homelab kept in rotation`,
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
    `> Last updated: ${today()}`,
    "",
    `> For comprehensive context including blog post topics, FAQs, and tool features, see [llms-full.txt](${siteUrl}/llms-full.txt).`,
    "",
    "## About",
    "",
    ABOUT,
    "",
    sectionsBlock(siteUrl),
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

/** Renders one locale's posts as `### title` blocks with body, for llms-full. */
function buildPostSection(
  posts: CollectionEntry<"posts">[],
  siteUrl: string,
  localePrefix: "" | "/es",
): string[] {
  return posts.flatMap((p) => {
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
  });
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
export async function generateLlmsFullTxt(siteUrl: string): Promise<string> {
  const postsEn = await getPostsByLocale("en");
  const postsEs = await getPostsByLocale("es");
  const toolsEn = await getToolsByLocale("en");
  const toolsEs = await getToolsByLocale("es");
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
      return `- ${pub.title}${yearPart}${authorPart}${venuePart}.`;
    }),
    "",
  ]);

  const postSectionEn = buildPostSection(postsEn, siteUrl, "");
  const postSectionEs = buildPostSection(postsEs, siteUrl, "/es");
  const toolSectionEn = buildToolSection(toolsEn, siteUrl);
  const toolSectionEs = buildToolSection(toolsEs, siteUrl);

  const lines = [
    "# jmrp.io — Full Context",
    "",
    `> ${DESCRIPTION}`,
    "",
    `> Last updated: ${today()}`,
    "",
    "## About the Author",
    "",
    ABOUT,
    "",
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
    "## Curriculum Vitae",
    "",
    ...cvSection,
    "",
    "## Publications",
    "",
    ...publicationsSection,
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
