import { useTranslations } from "@i18n/utils";
import { getCVData } from "@utils/cv";
import { getProjects, hostedHref } from "@utils/projects";
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
 * ── Why it carries more than the bio ──────────────────────────────────────
 * This twin used to emit the lead, the note, "I build", "I write about" and
 * education, and stopped there — 41% of the page's word count and 36% of its
 * vocabulary, against 104–159% for every other twin. What it dropped was the
 * half of the page worth citing: the four featured open-source projects with
 * their technologies and metrics, the contact block, and the editorial &
 * corrections policy that every post's AI-assistance disclosure links to. On
 * the one page that exists to answer "who is this person and what does he
 * build", the answer to the second half was missing.
 *
 * Every added block reads the SAME source the page reads, so the twin cannot
 * drift from what a visitor sees: the curated name list in `about.yaml`
 * resolved against the CV's own `projects` section, the running instances
 * from `projects.yaml`, and the policy from the translation bundle.
 *
 * @param locale - Which locale's copy to render.
 * @returns Markdown lines.
 */
export async function aboutLines(
  locale: "en" | "es",
  siteUrl: string,
): Promise<Lines> {
  const entry = await getEntry("profile", "about");
  // Throwing, like AboutPage and UsesPage do for the same condition: a twin
  // with a header and no body would publish an empty document and keep the
  // build green.
  if (entry?.data.type !== "about") {
    throw new Error("profile/about.yaml is missing or has the wrong type");
  }
  const d = entry.data[locale];
  const t = useTranslations(locale);

  // Narrowed through the discriminant rather than indexed straight off the
  // `find`: `CVSection` is a discriminated union whose `skills` and
  // `certificates` branches carry `groups`, not `items`, so `.items` straight
  // off the `find` does not type-check. AboutPage.astro flattens `items`
  // across ALL sections through an `as unknown as` cast; today both reach the
  // same four projects, because `projects` is the only body section with an
  // `items` array of named entries, but this way is checked.
  const cv = await getCVData(locale);
  const projectsSection = cv.sections.find(
    (section) => section.kind === "projects",
  );
  const cvProjects =
    projectsSection?.kind === "projects" ? projectsSection.items : [];
  const hosted = await getProjects();
  // Throwing, not filtering: a name in `featuredProjects` that matches no CV
  // project would drop that project from the twin while AboutPage still
  // rendered it — the page and its markdown copy would disagree, silently and
  // in the direction nobody checks. Same failure class as the missing
  // about.yaml above, so it gets the same treatment.
  const featured = entry.data.featuredProjects.map((name) => {
    const project = cvProjects.find((p) => p.name === name);
    if (!project) {
      throw new Error(
        `about.yaml featuredProjects names "${name}", which no CV project matches`,
      );
    }
    return project;
  });

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
    `## ${d.labels.contact}`,
    "",
    // The same three rows the "say hi" card renders. The address is written
    // in plain text on purpose: ObfuscatedEmail exists to keep it out of the
    // MARKUP, and this document is machine-readable by definition — the very
    // same address is already published in person.jsonld and security.txt.
    `- git: https://github.com/jmrplens`,
    `- mail: ${entry.data.person.email}`,
    `- cv: ${siteUrl}${locale === "es" ? "/es" : ""}/cv/`,
    "",
    `## ${d.labels.projects}`,
    "",
    ...featured.flatMap((project) => [
      `### ${project.name}`,
      "",
      ...(project.tech ? [project.tech, ""] : []),
      // The YAML folds the description across several lines; collapsed so the
      // paragraph is one line, like every other prose block in these twins.
      ...(project.description
        ? [project.description.replaceAll(/\s+/gu, " ").trim(), ""]
        : []),
      ...(project.metrics ?? []).map((metric) => `- ${metric}`),
      // Every labelled link, not just the primary one the card renders: the
      // card can only afford one, and repository, docs and registry listings
      // are exactly what tells one project from another.
      ...(project.links ?? []).map((link) => `- ${link.label}: ${link.url}`),
      // The callable instance, when there is one. /projects/ shows it and the
      // profile cards do too, so withholding it here would make the twin the
      // only surface that hides that a project can be called right now.
      ...(() => {
        const live = hosted.find((candidate) => candidate.id === project.name);
        const href = live && hostedHref(live, locale);
        return href ? [`- Hosted: ${href}`] : [];
      })(),
      "",
    ]),
    `## ${d.labels.education}`,
    "",
    ...d.education.map((e) =>
      item(e.degree, [e.org, e.year, e.note].filter(Boolean).join(" · ")),
    ),
    "",
    // The editorial & corrections policy (#editorial). Every post discloses
    // AI assistance and links here for what that disclosure MEANS; a model
    // that read only the twin saw the disclosure and never the policy behind
    // it. The `// ` prefix is the page's kicker styling, not part of the
    // heading.
    `## ${t("pages.about.editorialTitle").replace(/^\/\/\s*/u, "")}`,
    "",
    t("pages.about.editorialBody1"),
    "",
    t("pages.about.editorialBody2"),
    "",
    t("pages.about.editorialBody3"),
    "",
    t("pages.about.editorialBody4"),
    "",
    `- mail: ${entry.data.person.email}`,
    `- security.txt: ${siteUrl}/.well-known/security.txt`,
    "",
  ];
}

/**
 * The `/uses/` page as markdown.
 *
 * @param locale - Which locale's copy to render.
 * @returns Markdown lines.
 */
export async function usesLines(
  locale: "en" | "es",
  _siteUrl: string,
): Promise<Lines> {
  const entry = await getEntry("profile", "uses");
  // Throwing, like AboutPage and UsesPage do for the same condition: a twin
  // with a header and no body would publish an empty document and keep the
  // build green.
  if (entry?.data.type !== "uses") {
    throw new Error("profile/uses.yaml is missing or has the wrong type");
  }
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
export async function projectsLines(
  locale: "en" | "es",
  _siteUrl: string,
): Promise<Lines> {
  const entry = await getEntry("profile", "projects");
  // Throwing, like AboutPage and UsesPage do for the same condition: a twin
  // with a header and no body would publish an empty document and keep the
  // build green.
  if (entry?.data.type !== "projects") {
    throw new Error("profile/projects.yaml is missing or has the wrong type");
  }
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
