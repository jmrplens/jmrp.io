import downloadsData from "@data/downloads.json";
import rawContributionsData from "@data/ghc/projects-contributions.json";
import { formatDate, formatNumber, useTranslations } from "@i18n/utils";
import { getCVData } from "@utils/cv";
import { DOWNLOADS_DISPLAY_MIN } from "@utils/downloads";
import { featuredRepos } from "@utils/github-facts";
import { siteDownloadsTotal } from "@utils/llms/downloads-total";
import {
  ACTIVITY_MIN_DAYS,
  communityFor,
  communityLine,
} from "@utils/project-facts";
import { getProjects, hostedHref, type Project } from "@utils/projects";
import { fillSiteFacts, getSiteFacts } from "@utils/site-facts";
import { getEntry } from "astro:content";

import { ACTIVE_REPOS } from "../../../scripts/ghc/roster.mjs";
import { asContributionsDataset } from "../../components/projects/dataset-types";
import { PRJ, type ProjectCardSsr } from "../../components/projects/ssr-tokens";

const contributionsData = asContributionsDataset(rawContributionsData);

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

/** `- **name**: detail`, with the detail omitted when absent. */
function item(name: string, detail?: string): string {
  return detail ? `- **${name}**: ${detail}` : `- **${name}**`;
}

/**
 * The download figure a project publishes, or `undefined` when it publishes
 * none.
 *
 * The same document, the same threshold and therefore the same DECISION as
 * `ProjectsPage.astro`: a project under `DOWNLOADS_DISPLAY_MIN` renders no
 * figure, because "a small number next to a project reads as a verdict on it"
 * — an editorial call the twin has no business overriding, and one the page's
 * own methodology note states out loud ("a project shows its own figure only
 * once it passes 1,000"). Publishing here what the page withholds would make
 * that sentence false in the very document it travels in.
 *
 * The value is the exact integer, not the card's `~88k`. Same reasoning as
 * `downloads.total` in `@utils/llms/home-facts`: the rounding exists to fit a
 * card, and the compact form is derivable from the integer and not the
 * reverse.
 *
 * @param id - The project's repository name, the key `downloads.json` uses.
 * @returns The count to publish, or nothing.
 */
function downloadsOf(id: string): number | undefined {
  const count = (
    downloadsData.projects as Record<string, { total?: number } | undefined>
  )[id]?.total;
  return count !== undefined && count >= DOWNLOADS_DISPLAY_MIN
    ? count
    : undefined;
}

/**
 * The page's own methodology paragraph, as the twin's opening prose.
 *
 * It is what closed audit #6's A4: what the figures below count, what they
 * deliberately do not (checksums, signatures, SBOMs), which channel is read by
 * hand and when, and why the per-project numbers do not sum to the site-wide
 * total. Numbers without it are the finding it fixed, and the twin published
 * neither. It also gives that total and the moment it was counted, through
 * the same `siteDownloadsTotal` the page calls (GEO audit #11, B11).
 *
 * Dropped, exactly as the page drops it, when the hand-read date is missing or
 * unparseable: `downloads.json` is generated and git-ignored, so a build host
 * can hold a copy that predates the field, and `Intl.DateTimeFormat.format`
 * throws on an invalid Date. The `typeof` guard is load-bearing there too —
 * `new Date(null)` is the epoch, not an invalid date.
 *
 * @param locale - Which locale's copy, and which date format.
 * @returns The paragraph and its trailing blank line, or nothing.
 */
function downloadsMethodologyLines(locale: "en" | "es"): Lines {
  const t = useTranslations(locale);
  const raw: unknown = downloadsData.manualVerifiedOn;
  const verifiedOn = typeof raw === "string" ? new Date(raw) : undefined;
  if (!verifiedOn || Number.isNaN(verifiedOn.getTime())) return [];
  const source =
    "https://github.com/jmrplens/jmrp.io/blob/main/scripts/download-sources.mjs";
  const site = siteDownloadsTotal(downloadsData);
  const total = site
    ? ` ${t("pages.projects.downloadsTotal", {
        total: formatNumber(site.total, locale),
        date: formatDate(site.countedAt, locale),
      })}`
    : "";
  return [
    `${t("pages.projects.downloadsNote", {
      date: formatDate(verifiedOn, locale),
    })}${total} ${t("pages.projects.downloadsSourceLead")} [download-sources.mjs](${source}).`,
    "",
  ];
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

  const siteFacts = await getSiteFacts();
  return [
    ...d.lead.map((para) => fillSiteFacts(para, siteFacts)),
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
        return href ? [`- ${t("pages.projects.hosted")}: ${href}`] : [];
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
          ? `${item(i.name, i.detail)} · ${i.href}`
          : item(i.name, i.detail),
      ),
      "",
    ]),
  ];
}

/** What a project card needs besides the project itself. */
interface CardContext {
  /** Build-time star counts, by repository name. */
  readonly stars: ReadonlyMap<string, number | undefined>;
  /**
   * Whether live `PRJ_*` tokens may be emitted. Only `/projects/index.md` is
   * substituted by nginx (`TOKEN_PAGES` in `check-projects-tokens.mjs`); any
   * other document that printed one would publish the raw placeholder.
   */
  readonly live: boolean;
}

/** Whether `id` is a repository the live token registry covers. */
function isActiveRepoId(id: string): id is (typeof ACTIVE_REPOS)[number] {
  return (ACTIVE_REPOS as readonly string[]).includes(id);
}

/**
 * The stars and latest-version rows of one card.
 *
 * With live tokens these are the same tokens the card renders. The card
 * hides a row at serve time with its `*_CLASS` token; markdown has no CSS,
 * so a row is printed only when the build-time facts say the card shows it
 * (production audit 2026-09-27, N7): no stars row at 0 stars, no "(+N in
 * 30 d)" at a zero gain, no version row without a stable release. The edge
 * case: those facts are as of the build, so a first release or first star
 * after it reaches the twin with the next rebuild, while the page shows it
 * at once. Without the facts (an older dataset) the rows are omitted.
 *
 * Without live tokens the build-time star count is printed, and omitted
 * rather than printed as `0`, the rule `whoamiFactLines` already applies to
 * `repos.own`: a repository the fetch could not reach and one with no
 * stars are indistinguishable here.
 *
 * @param id - The project id.
 * @param live - The card's live tokens, when this document may print them.
 * @param buildStars - Build-time star count, if known.
 * @param t - Translator.
 * @returns Markdown lines.
 */
function cardStarsLines(
  id: string,
  live: ProjectCardSsr | undefined,
  buildStars: number | undefined,
  t: ReturnType<typeof useTranslations>,
): Lines {
  if (!live) {
    return buildStars
      ? [`- ${t("pages.projects.card.starsLabel")}: ${buildStars}`]
      : [];
  }
  const facts = contributionsData.cardFacts?.[id];
  const gain =
    facts && facts.stars30d > 0
      ? ` (${t("pages.projects.card.stars30dSuffix", { count: live.stars30d })})`
      : "";
  return [
    ...(facts && facts.stars > 0
      ? [`- ${t("pages.projects.card.starsLabel")}: ${live.stars}${gain}`]
      : []),
    ...(facts?.releaseTag
      ? [
          `- ${t("pages.projects.card.releaseLabel")}: ${live.relTag} · ${live.relAge}`,
        ]
      : []),
  ];
}

/**
 * The activity and community rows of an active card.
 *
 * @param id - The project id.
 * @param activeDays - Active days in the last 12 months, if known.
 * @param communityText - The community line, if any.
 * @param t - Translator.
 * @returns Markdown lines.
 */
function activityLines(
  id: string,
  activeDays: number | undefined,
  communityText: string | null | undefined,
  t: ReturnType<typeof useTranslations>,
): Lines {
  return [
    ...(isActiveRepoId(id) &&
    typeof activeDays === "number" &&
    activeDays > ACTIVITY_MIN_DAYS
      ? [
          `- ${t("pages.projects.card.activityLabel")}: ${t("pages.projects.card.activityDaysSuffix", { count: activeDays })}`,
        ]
      : []),
    ...(communityText
      ? [`- ${t("pages.projects.card.communityLabel")}: ${communityText}`]
      : []),
  ];
}

/**
 * The optional link rows of a card: the hosted page, the endpoint and other
 * places the project lives. The hosted page is the localized one, as the
 * card links it: the Spanish twin used to point at the English mcp.jmrp.io
 * page (twin audit 2026-09-27, E2).
 *
 * @param p - The project.
 * @param hosted - The localized hosted page, if any.
 * @param t - Translator.
 * @returns Markdown lines.
 */
function extraLinkLines(
  p: Project,
  hosted: string | null | undefined,
  t: ReturnType<typeof useTranslations>,
): Lines {
  return [
    ...(hosted ? [`- ${t("pages.projects.hosted")}: ${hosted}`] : []),
    ...(p.endpoint
      ? [`- ${t("pages.projects.twin.endpoint")}: ${p.endpoint}`]
      : []),
    ...(p.sameAs && p.sameAs.length > 0
      ? [`- ${t("pages.projects.twin.alsoAt")}: ${p.sameAs.join(", ")}`]
      : []),
  ];
}

/**
 * The facts one `/projects/` card prints, as markdown lines: the static meta
 * row (language, license, "Runs on", downloads), the live box of an active
 * card (stars with the 30-day delta, latest version, activity, community),
 * then topics and every link.
 *
 * Field labels are the page's own, localized: the Spanish twin used to print
 * `Language:`, `License:`, `Status: active` beside Spanish prose (twin audit
 * 2026-09-27, W8). Only the document header keeps its fixed English keys.
 *
 * @param p - The project.
 * @param locale - Which locale.
 * @param ctx - Build-time stars and whether live tokens are allowed.
 * @returns Markdown lines, ending with a blank line.
 */
function projectCardLines(
  p: Project,
  locale: "en" | "es",
  ctx: CardContext,
): Lines {
  const t = useTranslations(locale);
  const downloads = downloadsOf(p.id);
  const live = ctx.live && isActiveRepoId(p.id) ? PRJ.cards[p.id] : undefined;
  const maintenance = contributionsData.maintenance.find(
    (m) => m.repo === p.id,
  );
  const activeDays = maintenance?.activeDays12m;
  const community = isActiveRepoId(p.id)
    ? communityFor(contributionsData.communityContributors, p.id)
    : {};
  const communityText = communityLine(community.issues, community.prs, locale);
  const hosted = hostedHref(p, locale);
  const starsLine = cardStarsLines(p.id, live, ctx.stars.get(p.id), t);
  return [
    `### ${p.name}`,
    "",
    p.summary[locale],
    "",
    `- ${t("pages.projects.language")}: ${p.language}`,
    `- ${t("pages.projects.license")}: ${p.license}`,
    `- ${t("pages.projects.twin.status")}: ${t(p.status === "active" ? "pages.projects.twin.statusActive" : "pages.projects.twin.statusArchived")}`,
    ...(p.operatingSystem
      ? [`- ${t("pages.projects.runsOn")}: ${p.operatingSystem}`]
      : []),
    ...(downloads === undefined
      ? []
      : [
          `- ${t("pages.projects.downloads")}: ${formatNumber(downloads, locale)}`,
        ]),
    ...starsLine,
    ...activityLines(p.id, activeDays, communityText, t),
    `- ${t("pages.projects.twin.topics")}: ${p.topics.map(namedTopic).join(", ")}`,
    `- ${t("pages.projects.twin.repository")}: ${p.repo}`,
    `- ${t("pages.projects.twin.documentation")}: ${locale === "es" ? (p.docsEs ?? p.docs) : p.docs}`,
    ...extraLinkLines(p, hosted, t),
    "",
  ];
}

/**
 * One of the page's two project groups (maintained, archived): its heading,
 * its intro and every card, in `projects.yaml` order.
 *
 * @param status - Which group.
 * @param locale - Which locale.
 * @param options - Whether live `PRJ_*` tokens may be emitted.
 * @param options.live - True only for `/projects/index.md`.
 * @returns Markdown lines.
 */
export async function projectGroupLines(
  status: "active" | "archived",
  locale: "en" | "es",
  options: { live: boolean },
): Promise<Lines> {
  const t = useTranslations(locale);
  const projects = (await getProjects()).filter((p) => p.status === status);
  if (projects.length === 0) return [];
  // Keyed by `name`, which for these repositories is the `id` asked for;
  // `project.name` is the display name and can differ ("Cloudflare DNS
  // Updater" vs `Cloudflare-DNS-Updater`).
  const stars = new Map(
    (await featuredRepos(projects.map((p) => p.id))).map((repo) => [
      repo.name,
      repo.stargazers_count,
    ]),
  );
  const heading = t(
    status === "active"
      ? "pages.projects.activeHeading"
      : "pages.projects.archivedHeading",
  ).replace(/^\/\/\s*/u, "");
  const intro = t(
    status === "active"
      ? "pages.projects.activeIntro"
      : "pages.projects.archivedIntro",
  );
  return [
    `## ${heading}`,
    "",
    intro,
    "",
    ...projects.flatMap((p) =>
      projectCardLines(p, locale, { stars, live: options.live }),
    ),
  ];
}

/**
 * The page's methodology note, exported for `/projects/index.md`, which
 * assembles the page in its own order.
 *
 * @param locale - Which locale.
 * @returns The paragraph and its trailing blank line, or nothing.
 */
export function projectsMethodologyLines(locale: "en" | "es"): Lines {
  return downloadsMethodologyLines(locale);
}

/**
 * The `/projects/` page as markdown, without live tokens.
 *
 * Emits the facts the page's JSON-LD carries: language, license, topics with
 * their Q-ids, and every URL, because those are exactly what a model needs
 * to tell one project from another, and they exist nowhere else in prose
 * form. It also carries the figures (GEO audit #7, A2): the download count
 * of every project that has one plus the methodology paragraph behind them,
 * and the star count through `@utils/github-facts`.
 *
 * `/projects/index.md` itself is assembled by `projectsPageMarkdown`, which
 * interleaves the upstream and maintenance blocks and allows live tokens.
 *
 * @param locale - Which locale's summary to render.
 * @returns Markdown lines.
 */
export async function projectsLines(
  locale: "en" | "es",
  _siteUrl: string,
): Promise<Lines> {
  return [
    ...downloadsMethodologyLines(locale),
    ...(await projectGroupLines("active", locale, { live: false })),
    ...(await projectGroupLines("archived", locale, { live: false })),
  ];
}
