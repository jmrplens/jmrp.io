import { getEntry } from "astro:content";

/**
 * Markdown twins for the three profile pages whose content is structured data.
 *
 * ── Why these are generated and not authored as MDX ───────────────────────
 * Rewriting these pages as MDX would give the converter a body to chew on and
 * look like less machinery. It would also destroy what makes them worth
 * publishing: `projects.yaml` carries `schemaType`, `applicationCategory`,
 * `sameAs` and verified Wikidata Q-ids that become JSON-LD, and `about.yaml`
 * carries the `person` block behind the Person schema. Prose cannot hold a
 * Q-id. The YAML stays the single source and the markdown is derived from it,
 * so the structured data and the twin can never disagree.
 *
 * `/uses/` has no schema, but it is an inventory — a table of names and
 * details — and an inventory written as prose is worse in both directions.
 *
 * @module
 */

/** A rendered markdown document, as lines. */
type Lines = string[];

/** `Name (Q123)` — a topic with its Wikidata id. */
function namedTopic(topic: { name: string; wikidata: string }): string {
  return `${topic.name} (${topic.wikidata})`;
}

/** `- **name** — detail`, with the detail omitted when absent. */
function item(name: string, detail?: string): string {
  return detail ? `- **${name}** — ${detail}` : `- **${name}**`;
}

/**
 * The `/about/` page as markdown.
 *
 * @param locale - Which locale's copy to render.
 * @returns Markdown lines.
 */
export async function aboutLines(locale: "en" | "es"): Promise<Lines> {
  const entry = await getEntry("profile", "about");
  if (entry?.data.type !== "about") return [];
  const d = entry.data[locale];
  return [
    ...d.lead,
    "",
    d.note,
    "",
    `## ${d.labels.build}`,
    "",
    ...d.build.map((line) => `- ${line}`),
    "",
    `## ${d.labels.writesAbout}`,
    "",
    ...d.writesAbout.map((line) => `- ${line}`),
    "",
    `## ${d.labels.education}`,
    "",
    ...d.education.map((e) =>
      item(e.degree, [e.org, e.year, e.note].filter(Boolean).join(" · ")),
    ),
    "",
  ];
}

/**
 * The `/uses/` page as markdown.
 *
 * @param locale - Which locale's copy to render.
 * @returns Markdown lines.
 */
export async function usesLines(locale: "en" | "es"): Promise<Lines> {
  const entry = await getEntry("profile", "uses");
  if (entry?.data.type !== "uses") return [];
  const d = entry.data[locale];
  return [
    d.intro,
    "",
    ...d.groups.flatMap((group) => [
      `## ${group.label.replace(/^\/\/\s*/u, "")}`,
      "",
      ...(group.intro ? [group.intro, ""] : []),
      ...group.items.map((i) =>
        // The href, when there is one, is the thing a reader would otherwise
        // have to search for. The site's link policy only puts one on the
        // author's own services, so this is never an ad.
        i.href
          ? `${item(i.name, i.detail)} — ${i.href}`
          : item(i.name, i.detail),
      ),
      "",
    ]),
  ];
}

/**
 * The `/projects/` page as markdown.
 *
 * Emits the facts the page's JSON-LD carries — language, license, topics with
 * their Q-ids, and every URL — because those are exactly what a model needs to
 * tell one project from another, and they exist nowhere else in prose form.
 *
 * @param locale - Which locale's summary to render.
 * @returns Markdown lines.
 */
export async function projectsLines(locale: "en" | "es"): Promise<Lines> {
  const entry = await getEntry("profile", "projects");
  if (entry?.data.type !== "projects") return [];
  return entry.data.projects.flatMap((p) => [
    `## ${p.name}`,
    "",
    p.summary[locale],
    "",
    `- Language: ${p.language}`,
    `- License: ${p.license}`,
    `- Status: ${p.status}`,
    `- Topics: ${p.topics.map(namedTopic).join(", ")}`,
    `- Repository: ${p.repo}`,
    `- Documentation: ${locale === "es" ? (p.docsEs ?? p.docs) : p.docs}`,
    ...(p.hosted ? [`- Hosted: ${p.hosted}`] : []),
    ...(p.endpoint ? [`- Endpoint: ${p.endpoint}`] : []),
    ...(p.sameAs && p.sameAs.length > 0
      ? [`- Also at: ${p.sameAs.join(", ")}`]
      : []),
    "",
  ]);
}
