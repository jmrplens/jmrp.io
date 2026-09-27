import rawContributionsData from "@data/ghc/projects-contributions.json";
import { formatDate, formatNumber, useTranslations } from "@i18n/utils";
import { listedContributionCounts } from "@utils/contribution-counts";
import {
  itemRef,
  itemUrl,
  platformOf,
  repoUrl,
} from "@utils/contribution-links";
import { diffSizeText, itemDiffSize, languageCounts } from "@utils/diff-size";
import { getPageFaq, pageFaqLines } from "@utils/page-faq";
import {
  dependabotSentence,
  formatMergeDuration,
  githubSearchUrl,
  gitlabListing,
  LEDGER_MAX_ITEMS,
  maintenanceCells,
  maintenanceRows,
} from "@utils/project-facts";
import { getProjects } from "@utils/projects";
import { getEntry } from "astro:content";

import { foldProjectName } from "../../../scripts/ghc/contributions-yaml.mjs";
import { OWNER as GITHUB_OWNER } from "../../../scripts/ghc/roster.mjs";
import { asContributionsDataset } from "../../components/projects/dataset-types";
import { PRJ } from "../../components/projects/ssr-tokens";
import { alternateTwinUrl, documentHeader } from "../llms";
import {
  projectGroupLines,
  projectsMethodologyLines,
} from "./profile-markdown";

const contributionsData = asContributionsDataset(rawContributionsData);

/** Upstream projects the /projects/ strip shows, as `ProjectsPage.astro`. */
const CONTRIBUTED_TO_SHOWN = 6;

/**
 * Markdown twins for /projects/ (live `PRJ_*` tokens, like the homelab twin)
 * and /projects/contributions/ (100% build-time).
 *
 * ── Why /projects/ writes its own header ───────────────────────────────
 * Same reason as `homelabMarkdown`: its freshness line is a LIVE capture
 * token (`PRJ_AS_OF`), substituted at serve time by the same nginx body
 * filter that substitutes every other `PRJ_*` figure on the page — see
 * `ssr-tokens.ts`'s module doc comment. `documentHeader`'s `Updated:` line is
 * a BUILD-TIME content date and would be misleading here.
 *
 * @module
 */

/** A rendered markdown document, as lines. */
type Lines = string[];

/** "GitHub" / "GitLab" for a platform field. */
function platformName(
  platform: string | undefined,
  t: ReturnType<typeof useTranslations>,
): string {
  return platformOf(platform) === "gitlab"
    ? t("pages.projectsContributions.platformGitlab")
    : t("pages.projectsContributions.platformGithub");
}

/**
 * One ledger item's title (or a redaction notice) plus its state and timing,
 * for the ledger's bullet lines: "(merged in 6 days)", "(open, under
 * review)", "(merged, opened September 3, 2026)" when the merge time is
 * unknown. The page prints the same timing beside every item; the twin
 * used to print only the state (twin audit 2026-09-27, W4).
 */
function ledgerItemLabel(
  item: {
    redacted: boolean;
    title: string | null;
    fullName: string;
    number: number;
    state: string;
    kind: "pull_request" | "issue";
    platform?: string;
    hoursToMerge: number | null;
    createdAt: string;
    additions?: number | null;
    deletions?: number | null;
    changedFiles?: number | null;
  },
  t: ReturnType<typeof useTranslations>,
  locale: "en" | "es",
): string {
  const title =
    item.redacted || !item.title
      ? t("pages.projectsContributions.itemRedacted")
      : itemTitleLine(item);
  const size = diffSizeText(
    itemDiffSize(item),
    platformOf(item.platform),
    locale,
  )?.plain;
  const label = size ? `${title} [${size}]` : title;
  if (item.state === "merged" && item.hoursToMerge !== null) {
    return `${label} (${t("pages.projectsContributions.mergedIn", {
      duration: formatMergeDuration(item.hoursToMerge, locale),
    })})`;
  }
  const timing =
    item.state === "open"
      ? t("pages.projectsContributions.underReview")
      : t("pages.projectsContributions.openedOn", {
          date: formatDate(new Date(item.createdAt), locale),
        });
  return `${label} (${stateLabel(item.state, t)}, ${timing})`;
}

/**
 * The "Showing the 10 most recent." note with the link to the full listing,
 * exactly as the page prints it under a truncated project.
 *
 * @param project - The folded project name.
 * @param items - All of the project's items.
 * @param t - Translator.
 * @returns One markdown line.
 */
function truncationNote(
  project: string,
  items: readonly { fullName: string; platform?: string }[],
  t: ReturnType<typeof useTranslations>,
): string {
  const shown = t("pages.projectsContributions.shownNewest", {
    shown: LEDGER_MAX_ITEMS,
  });
  if (platformOf(items[0]?.platform) === "gitlab") {
    const listing = gitlabListing(
      items,
      contributionsData.gitlab?.username ?? "jmrp",
    );
    return `${shown} [${t("pages.projectsContributions.seeAllOnGitlab", { repo: listing.repo })}](${listing.url})`;
  }
  return `${shown} [${t("pages.projectsContributions.seeAllOnGithub", { total: items.length, project })}](${githubSearchUrl(items, GITHUB_OWNER)})`;
}

/**
 * A ledger item's state in the page's own pill words (merged/open/not
 * merged), localized and lowercased to read as a parenthetical in prose.
 */
function stateLabel(
  state: string,
  t: ReturnType<typeof useTranslations>,
): string {
  if (state === "merged")
    return t("pages.projectsContributions.itemMergedPill").toLowerCase();
  if (state === "open")
    return t("pages.projectsContributions.itemOpenPill").toLowerCase();
  return t("pages.projectsContributions.itemNotMergedPill").toLowerCase();
}

/** A "{count} merged/open" label, with the singular form for 1. */
function countLabel(
  key: "summaryMerged" | "summaryOpen" | "summaryClosed",
  count: number,
  t: ReturnType<typeof useTranslations>,
): string {
  return t(`pages.projectsContributions.${key}${count === 1 ? "One" : ""}`, {
    count,
  });
}

/** `owner/repo #number title` (`!iid` for a GitLab merge request), split out so it is never nested inside a ternary. */
function itemTitleLine(item: {
  fullName: string;
  number: number;
  title: string | null;
  kind: "pull_request" | "issue";
  platform?: string;
}): string {
  return `${item.fullName} ${itemRef(item)} ${item.title ?? ""}`;
}

/** Localized tier label ("Gold, max tier", "Silver", …) for a GitHub achievement. */
function tierLabel(
  tierName: "gold" | "silver" | "bronze" | "default",
  t: ReturnType<typeof useTranslations>,
): string {
  const keys = {
    gold: "tierGold",
    silver: "tierSilver",
    bronze: "tierBronze",
    default: "tierBase",
  } as const;
  return t(`pages.projectsContributions.${keys[tierName]}`);
}

/**
 * A button label without its trailing "→" (and the space before it); the
 * markdown link needs no arrow.
 *
 * @param label - The localized label.
 * @returns The label, arrow removed.
 */
function withoutTrailingArrow(label: string): string {
  return label.endsWith("→") ? label.slice(0, -1).trimEnd() : label;
}

/**
 * The "Contributions to other projects" section, shared by both twins where
 * their content overlaps (the live-token summary and the build-time
 * "contributed to" strip) — the same data `UpstreamBlock.astro` renders on
 * the page itself.
 *
 * @param locale - Target locale.
 * @param siteUrl - Absolute site origin, for the link to the subpage.
 * @returns Markdown lines.
 */
function upstreamLines(locale: "en" | "es", siteUrl: string): Lines {
  const t = useTranslations(locale);
  const prefix = locale === "es" ? "/es" : "";

  const stripLines = contributionsData.contributedTo
    .slice(0, CONTRIBUTED_TO_SHOWN)
    .map((row) => {
      const notes = [row.language, row.stars === null ? null : `${row.stars}★`]
        .filter(Boolean)
        .join(", ");
      const meta = notes ? ` (${notes})` : "";
      return `- ${row.project}${meta}: ${repoUrl(row.repo, row.platform)}`;
    });
  // The page's "and 7 more · list as of <date>" line under the strip: without
  // it the twin read as if six projects were the whole list.
  const remaining = Math.max(
    0,
    contributionsData.contributedTo.length - CONTRIBUTED_TO_SHOWN,
  );
  const subpage = `${siteUrl}${prefix}/projects/contributions/`;

  return [
    `## ${t("pages.projects.upstream.heading")}`,
    "",
    t("pages.projects.upstream.intro"),
    "",
    `- ${t("pages.projects.upstream.tileCodeMerged")}: ${PRJ.upstream.codeMerged}`,
    `- ${t("pages.projects.upstream.tileCodeUpstreams")}: ${PRJ.upstream.codeUpstreams}`,
    `- ${t("pages.projects.upstream.tilePrOpen")}: ${PRJ.upstream.prOpen}`,
    `- ${t("pages.projects.upstream.tileAnswers")}: ${PRJ.upstream.answers}`,
    // Its own paragraph, the leading "+" escaped: right under a "-" list, a
    // line starting "+ " opens a second list and a renderer drops the sign
    // (production audit 2026-09-27, N8).
    "",
    t("pages.projects.upstream.listingNote", {
      count: PRJ.upstream.listingMerged,
    }).replace(/^\+/u, String.raw`\+`),
    "",
    `### ${t("pages.projects.upstream.contributedToTitle")}`,
    "",
    ...stripLines,
    ...(remaining > 0
      ? [
          "",
          t("pages.projects.upstream.andMore", {
            count: remaining,
            date: formatDate(new Date(contributionsData.asOf), locale),
          }),
        ]
      : []),
    "",
    t("pages.projects.upstream.liveLabel", { time: PRJ.asOf }),
    "",
    // The page's button to the subpage, which the twin only named inside an
    // HTML comment (twin audit 2026-09-27, W1).
    `[${withoutTrailingArrow(t("pages.projects.upstream.subpageLink"))}](${subpage})`,
    "",
  ];
}

/**
 * The activity band at the top of /projects/: four live figures and their
 * capture time, as the page prints them.
 *
 * @param locale - Target locale.
 * @returns Markdown lines.
 */
function activityBandLines(locale: "en" | "es"): Lines {
  const t = useTranslations(locale);
  return [
    `## ${t("pages.projects.activity.regionLabel")}`,
    "",
    `- ${t("pages.projects.activity.releases90d")}: ${PRJ.activity.releases90d}`,
    `- ${t("pages.projects.activity.stars30d")}: ${PRJ.activity.stars30d}`,
    `- ${t("pages.projects.activity.activeDays")}: ${PRJ.activity.activeDays}`,
    `- ${t("pages.projects.activity.streak")}: ${PRJ.activity.streak}`,
    "",
    t("pages.projects.activity.liveLabel", { time: PRJ.asOf }),
    "",
  ];
}

/**
 * "How I maintain the projects": the page's table, as a markdown table with
 * the same columns and cell texts, plus the Dependabot sentence under it
 * (twin audit 2026-09-27, W2).
 *
 * @param locale - Target locale.
 * @returns Markdown lines.
 */
async function maintenanceLines(locale: "en" | "es"): Promise<Lines> {
  const t = useTranslations(locale);
  const nameById = new Map((await getProjects()).map((p) => [p.id, p.name]));
  const rows = maintenanceRows(contributionsData.maintenance, nameById);
  if (rows.length === 0) return [];
  const sentence = dependabotSentence(contributionsData.dependabot, locale);
  const cols = [
    t("pages.projects.maintenance.colProject"),
    t("pages.projects.maintenance.colCiOn"),
    t("pages.projects.maintenance.colCiJobs"),
    t("pages.projects.maintenance.colPassRate"),
    t("pages.projects.maintenance.colCodeQl"),
  ];
  return [
    `## ${t("pages.projects.maintenance.heading")}`,
    "",
    `| ${cols.join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => {
      const c = maintenanceCells(row, locale);
      return `| ${row.projectName} | ${c.ciOn} | ${c.jobs} | ${c.passRate} | ${c.codeQl} |`;
    }),
    "",
    ...(sentence ? [sentence, ""] : []),
  ];
}

/**
 * The page's support section, when the author publishes a sponsor link.
 *
 * @param locale - Target locale.
 * @returns Markdown lines.
 */
async function supportLines(locale: "en" | "es"): Promise<Lines> {
  const t = useTranslations(locale);
  const about = await getEntry("profile", "about");
  const sponsorUrl =
    about?.data.type === "about" ? about.data.person.sponsorUrl : undefined;
  if (!sponsorUrl) return [];
  return [
    `## ${t("pages.projects.supportHeading")}`,
    "",
    t("pages.projects.supportIntro"),
    "",
    `- ${t("pages.projects.supportLink")}: ${sponsorUrl}`,
    "",
  ];
}

/**
 * `/projects/index.md` (and its `/es/` twin): the existing static project
 * roster, PLUS the live "Contributions to other projects" summary. Written
 * by hand, like `homelabMarkdown`, because `PRJ_AS_OF` is a live capture
 * token, not a build-time `Updated:` date.
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Target locale.
 * @returns The complete file body.
 */
export async function projectsPageMarkdown(
  siteUrl: string,
  locale: "en" | "es",
): Promise<string> {
  const prefix = locale === "es" ? "/es" : "";
  const url = `${siteUrl}${prefix}/projects/`;

  const upstream = upstreamLines(locale, siteUrl);

  return [
    `# ${locale === "es" ? "Proyectos" : "Projects"}`,
    "",
    `Canonical: ${url}`,
    `Language: ${locale}`,
    `Alternate: ${alternateTwinUrl(url, locale)}`,
    `License: ${new URL(locale === "es" ? "/es/license/" : "/license/", url).href}`,
    `Live: ${PRJ.asOf}`,
    "",
    // The page's own order: note, activity band, maintained projects, the
    // upstream block, the maintenance table, archived projects, support.
    ...projectsMethodologyLines(locale),
    ...activityBandLines(locale),
    ...(await projectGroupLines("active", locale, { live: true })),
    ...upstream,
    ...(await maintenanceLines(locale)),
    ...(await projectGroupLines("archived", locale, { live: true })),
    ...(await supportLines(locale)),
    ...pageFaqLines(await getPageFaq("/projects/", locale), locale),
  ].join("\n");
}

/**
 * `/projects/contributions/index.md`: 100% build-time twin of
 * `ContributionsPage.astro` — no `PRJ_*` token anywhere (verified by
 * `check-markdown-twins.mjs`'s sibling guard, `check-projects-ssr.mjs`, a
 * later task).
 *
 * @param siteUrl - Absolute site origin.
 * @param locale - Target locale.
 * @returns The complete file body.
 */
export async function contributionsPageMarkdown(
  siteUrl: string,
  locale: "en" | "es",
): Promise<string> {
  const t = useTranslations(locale);
  const prefix = locale === "es" ? "/es" : "";
  const url = `${siteUrl}${prefix}/projects/contributions/`;

  const contributionsEntry = await getEntry("profile", "contributions");
  if (contributionsEntry?.data.type !== "contributions") {
    throw new Error(
      "profile/contributions.yaml is missing or has the wrong type",
    );
  }
  const { displayName } = contributionsEntry.data;

  const { summary, ledgerByYear, acceptedAnswers, achievements } =
    contributionsData;
  const asOfDate = new Date(contributionsData.asOf);
  // The page's counts, derived from the lists they head (N1).
  const listed = listedContributionCounts({
    ledgerByYear,
    issuesByProject: contributionsData.issuesByProject,
    listingSplit: summary.codeVsListingSplit.listing,
  });

  const byLanguage = languageCounts(contributionsData.contributedTo);
  const contributedToStars = new Map(
    contributionsData.contributedTo.map((row) => [row.project, row.stars]),
  );
  const highlightLines = contributionsData.highlights.flatMap((h) => {
    const project = foldProjectName(h.repo, displayName);
    const stars = contributedToStars.get(project);
    const notes = [
      h.language,
      diffSizeText(h.size, platformOf(h.platform), locale)?.plain,
      stars ? `${stars}★` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const metaNote = notes ? ` (${notes})` : "";
    return [
      `- **${h.repo} ${itemRef(h)}**${metaNote}: ${h.why[locale]} (${platformName(h.platform, t)}, ${itemUrl({ ...h, fullName: h.repo })})`,
    ];
  });

  // One entry per project across every year, like the page itself.
  const allItems = Object.values(ledgerByYear).flatMap((projects) =>
    Object.entries(projects).flatMap(([project, items]) =>
      items.map((item) => ({ project, item })),
    ),
  );
  const byProject = new Map<string, (typeof allItems)[number]["item"][]>();
  for (const { project, item } of allItems) {
    if (item.state === "closed") continue;
    byProject.set(project, [...(byProject.get(project) ?? []), item]);
  }
  const notMerged = listed.codeNotMerged;
  const ledgerLines = [
    ...[...byProject]
      .map(([project, items]) => ({
        project,
        items: items.toSorted(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        ),
        merged: items.filter((it) => it.state === "merged").length,
        open: items.filter((it) => it.state === "open").length,
      }))
      // Projects with merged work first, then open-only ones; each group by
      // most recent activity, so an old project cannot outrank this month's.
      .sort(
        (a, b) =>
          Number(b.merged > 0) - Number(a.merged > 0) ||
          Date.parse(b.items[0].createdAt) - Date.parse(a.items[0].createdAt),
      )
      .flatMap(({ project, items, merged, open }) => [
        // Only the non-zero counts, joined as the page's summary joins them.
        `- **${project}** (${platformName(items[0]?.platform, t)}): ${[
          merged > 0 ? countLabel("summaryMerged", merged, t) : "",
          open > 0 ? countLabel("summaryOpen", open, t) : "",
        ]
          .filter(Boolean)
          .join(" · ")}`,
        ...items
          .slice(0, LEDGER_MAX_ITEMS)
          .map((it) => `  - ${ledgerItemLabel(it, t, locale)}`),
        // The page says when it cut the list and links the full one; the
        // twin cut at the same place without saying so (twin audit
        // 2026-09-27, W4).
        ...(items.length > LEDGER_MAX_ITEMS
          ? [`  - ${truncationNote(project, items, t)}`]
          : []),
      ]),
    ...(notMerged > 0
      ? [
          "",
          t("pages.projectsContributions.notMergedHeading", {
            count: notMerged,
          }),
        ]
      : []),
    "",
  ];

  const listingLines = Object.entries(contributionsData.listingsByOwnProject)
    .filter(([own]) => own !== "other")
    .map(([own, targets]) => {
      const parts = Object.entries(targets).map(([name, row]) => {
        const link = `[${name}](https://github.com/${row.fullName})`;
        // Every state the page's pills show: a target can have merged work
        // AND a PR under review, and the twin used to drop the second
        // (twin audit 2026-09-27, W5). The merged count uses the page's own
        // plural key instead of "×8 (merged)" beside a singular noun (W6).
        const states = [
          ...(row.merged > 1
            ? [
                t("pages.projectsContributions.mergedTimes", {
                  count: row.merged,
                }),
              ]
            : []),
          ...(row.merged === 1 ? [stateLabel("merged", t)] : []),
          ...(row.open > 0
            ? [t("pages.projectsContributions.underReview")]
            : []),
        ];
        return `${link} (${states.join(", ")})`;
      });
      return `- **${own}**: ${parts.join(", ")}`;
    });

  const answerLines = acceptedAnswers.map(
    (a) => `- ${a.fullName} #${a.number}: [${a.title}](${a.answerUrl})`,
  );

  // The page's shelf, line by line: tier and multiplier ("x4") for GitHub,
  // the estimated progress to the next tier where the page shows it, the
  // award date for GitLab, and the note naming the achievements hidden by
  // design (twin audit 2026-09-27, W4).
  const achievementLines = achievements.map((a) => {
    if (a.platform !== "gitlab") {
      const multiplier = a.tierNumber > 1 ? ` x${a.tierNumber}` : "";
      const progress =
        a.achievement !== "galaxy-brain" &&
        a.agrees &&
        a.nextThreshold > 0 &&
        a.count !== null
          ? `; ${t("pages.projectsContributions.achievementProgress", {
              value: a.count,
              max: a.nextThreshold,
              label: t("pages.projectsContributions.achievementEstimated"),
            })}`
          : "";
      return `- **${a.name}**${multiplier} (GitHub): ${tierLabel(a.tierName, t)}${progress}`;
    }
    // A full date takes "on"/"el"; the page's month-and-year form keeps
    // "en", which is wrong before a full date in Spanish (W6).
    const awarded = a.awardedAt
      ? t("pages.projectsContributions.achievementAwardedOn", {
          date: formatDate(new Date(a.awardedAt), locale),
        })
      : null;
    return awarded
      ? `- **${a.name}** (GitLab): ${awarded}`
      : `- **${a.name}** (GitLab)`;
  });
  const hasGithubAchievements = achievements.some(
    (a) => a.platform !== "gitlab",
  );

  // "Issues reported", with the per-project breakdown the page lists, in the
  // page's order (most issues first).
  const issueLines = Object.entries(contributionsData.issuesByProject)
    .toSorted(([, a], [, b]) => b.open + b.closed - (a.open + a.closed))
    .map(([project, counts]) => {
      const parts = [
        counts.open > 0 ? countLabel("summaryOpen", counts.open, t) : "",
        counts.closed > 0 ? countLabel("summaryClosed", counts.closed, t) : "",
      ].filter(Boolean);
      return `- ${project}: ${parts.join(" · ")}`;
    });

  return [
    ...documentHeader(
      t("pages.projectsContributions.title"),
      url,
      `${siteUrl}/llms.txt`,
      locale,
    ),
    "",
    t("pages.projectsContributions.snapshotIntro", {
      date: formatDate(asOfDate, locale),
      prs: formatNumber(listed.prs, locale),
      issues: formatNumber(listed.issues, locale),
      repos: formatNumber(summary.contributionTotals.repos, locale),
    }),
    "",
    `- ${t("pages.projects.upstream.tileCodeMerged")}: ${listed.codeMerged}`,
    `- ${t("pages.projects.upstream.tileListingMerged")}: ${listed.listingMerged}`,
    `- ${t("pages.projects.upstream.tilePrOpen")}: ${listed.codeOpen}`,
    `- ${t("pages.projects.upstream.tileAnswers")}: ${summary.answersCount}`,
    "",
    ...(byLanguage.length > 0
      ? [
          `${t("pages.projectsContributions.languagesLead")} ${byLanguage
            .map(([language, count]) => `${language} ${count}`)
            .join(", ")}`,
          "",
        ]
      : []),
    `## ${t("pages.projectsContributions.highlightsHeading")}`,
    "",
    ...highlightLines,
    "",
    `## ${t("pages.projectsContributions.ledgerHeading")}`,
    "",
    ...ledgerLines,
    `## ${t("pages.projectsContributions.distributionHeading")}`,
    "",
    ...listingLines,
    "",
    `## ${t("pages.projectsContributions.answersHeading", { count: acceptedAnswers.length })}`,
    "",
    ...answerLines,
    "",
    t("pages.projectsContributions.answersFooter", {
      accepted: summary.answersCount,
      discussions: summary.discussionTotals.discussions,
      repos: summary.discussionTotals.repos,
    }),
    "",
    `## ${t("pages.projectsContributions.issuesHeading", {
      total: listed.issues,
      open: listed.issuesOpen,
      closed: listed.issuesClosed,
    })}`,
    "",
    ...issueLines,
    "",
    `## ${t("pages.projectsContributions.achievementsHeading")}`,
    "",
    ...achievementLines,
    "",
    ...(hasGithubAchievements
      ? [t("pages.projectsContributions.achievementsHiddenNote"), ""]
      : []),
    ...pageFaqLines(
      await getPageFaq("/projects/contributions/", locale),
      locale,
    ),
  ].join("\n");
}
