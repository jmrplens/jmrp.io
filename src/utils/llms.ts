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
 * ingestion: strips `import` statements and collapses excess blank lines.
 * Component tags are left in place (harmless noise) to avoid corrupting code
 * blocks that legitimately contain `<` / `>`.
 */
function mdxToText(body: string): string {
  return body
    .replaceAll(/^import [^\n]*/gm, "")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
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

/** Published English posts, ordered by their numbered slug (chronological). */
async function getEnglishPosts() {
  const posts = await getCollection(
    "posts",
    (p) => p.data.lang === "en" && !p.data.draft,
  );
  return posts.sort((a, b) => a.data.slug.localeCompare(b.data.slug));
}

async function getSortedTools() {
  const tools = await getCollection("tools");
  return tools.sort((a, b) => a.data.title.localeCompare(b.data.title));
}

/**
 * Builds the locale-aware absolute URL for a tool entry — `/tools/<slug>/`
 * for English entries, `/es/tools/<slug>/` for Spanish entries. The tools
 * collection mixes both locales (see `getSortedTools()`), so the URL must
 * always be derived from `tool.data.lang`, never assumed to be English.
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
    `- [Homelab](${siteUrl}/homelab/): Self-hosted infrastructure — Mastodon, Matrix, Meshtastic, Tor relays`,
    `- [Projects](${siteUrl}/projects/): Curated open-source software he authors and maintains — MCP servers, acoustics tooling, network security; language, license, source and docs per project`,
    `- [GitHub](${siteUrl}/github/): Open source projects and contributions`,
    `- [Tools](${siteUrl}/tools/): Free browser-based developer tools (privacy-first, no server calls)`,
    `- [Uses](${siteUrl}/uses/): Hardware, software, and homelab kept in rotation`,
  ].join("\n");
}

/** Generates the concise `llms.txt` index. */
export async function generateLlmsTxt(siteUrl: string): Promise<string> {
  const posts = await getEnglishPosts();
  const tools = await getSortedTools();

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
    ...posts.map(
      (p) =>
        `- [${p.data.title}](${siteUrl}/blog/${p.data.slug}/)${
          p.data.description ? `: ${p.data.description}` : ""
        }`,
    ),
    "",
    "## Developer Tools",
    "",
    ...tools.map(
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

/** Generates the enriched `llms-full.txt` with per-post detail. */
export async function generateLlmsFullTxt(siteUrl: string): Promise<string> {
  const posts = await getEnglishPosts();
  const tools = await getSortedTools();
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

  const postSection = posts.flatMap((p) => {
    const d = p.data;
    return [
      `### ${d.title}`,
      "",
      `URL: ${siteUrl}/blog/${d.slug}/`,
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

  const toolSection = tools.flatMap((t) => [
    `### ${t.data.title}`,
    "",
    `URL: ${toolUrl(siteUrl, t)}`,
    `Category: ${t.data.category}`,
    t.data.description,
    "",
  ]);

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
    ...postSection,
    "## Developer Tools",
    "",
    ...toolSection,
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
