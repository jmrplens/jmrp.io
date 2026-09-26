import rawContributionsData from "@data/ghc/projects-contributions.json";
import { formatDate, useTranslations } from "@i18n/utils";
import {
  itemRef,
  itemUrl,
  platformOf,
  repoUrl,
} from "@utils/contribution-links";
import { getPageFaq, pageFaqLines } from "@utils/page-faq";
import { getEntry } from "astro:content";

import { foldProjectName } from "../../../scripts/ghc/contributions-yaml.mjs";
import { asContributionsDataset } from "../../components/projects/dataset-types";
import { PRJ } from "../../components/projects/ssr-tokens";
import { alternateTwinUrl, documentHeader } from "../llms";
import { projectsLines } from "./profile-markdown";

const contributionsData = asContributionsDataset(rawContributionsData);

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

/** One ledger item's title (or a redaction notice) plus its state, for the ledger's bullet lines. */
function ledgerItemLabel(
  item: {
    redacted: boolean;
    title: string | null;
    fullName: string;
    number: number;
    state: string;
    kind: "pull_request" | "issue";
    platform?: string;
  },
  t: ReturnType<typeof useTranslations>,
): string {
  const label =
    item.redacted || !item.title
      ? t("pages.projectsContributions.itemRedacted")
      : itemTitleLine(item);
  return `${label} (${stateLabel(item.state, t)})`;
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
  key: "summaryMerged" | "summaryOpen",
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
 * The "Contributions to other projects" section, shared by both twins where
 * their content overlaps (the live-token summary + build-time highlights and
 * "contributed to" strip) — the same data `UpstreamBlock.astro` renders on
 * the page itself.
 *
 * @param locale - Target locale.
 * @returns Markdown lines.
 */
async function upstreamLines(locale: "en" | "es"): Promise<Lines> {
  const t = useTranslations(locale);
  const contributionsEntry = await getEntry("profile", "contributions");
  if (contributionsEntry?.data.type !== "contributions") {
    throw new Error(
      "profile/contributions.yaml is missing or has the wrong type",
    );
  }
  const { displayName } = contributionsEntry.data;

  const highlightLines = contributionsData.highlights
    .slice(0, 3)
    .map(
      (h) =>
        `- **${h.repo} ${itemRef(h)}** (${platformName(h.platform, t)}, ${itemUrl({ ...h, fullName: h.repo })}): ${h.why[locale]}`,
    );

  const stripLines = contributionsData.contributedTo.slice(0, 6).map((row) => {
    const stars = row.stars === null ? "" : ` (${row.stars}★)`;
    return `- ${row.project}${stars}: ${repoUrl(row.repo, row.platform)}`;
  });

  return [
    `## ${t("pages.projects.upstream.heading")}`,
    "",
    t("pages.projects.upstream.intro"),
    "",
    `- ${t("pages.projects.upstream.tileCodeMerged")}: ${PRJ.upstream.codeMerged}`,
    `- ${t("pages.projects.upstream.tileCodeUpstreams")}: ${PRJ.upstream.codeUpstreams}`,
    `- ${t("pages.projects.upstream.tilePrOpen")}: ${PRJ.upstream.prOpen}`,
    `- ${t("pages.projects.upstream.tileAnswers")}: ${PRJ.upstream.answers}`,
    t("pages.projects.upstream.listingNote", {
      count: PRJ.upstream.listingMerged,
    }),
    "",
    `### ${t("pages.projects.upstream.highlightsTitle")}`,
    "",
    ...highlightLines,
    "",
    `### ${t("pages.projects.upstream.contributedToTitle")}`,
    "",
    ...stripLines,
    "",
    t("pages.projects.upstream.liveLabel", { time: PRJ.asOf }),
    "",
    // Referenced by full name so this line means the same thing even when
    // it is read out of context (an excerpt in a corpus digest, a partial
    // fetch) — folding `foldProjectName` in without using it would leave an
    // unused import and fail lint; used here for a project-count sanity
    // note that would otherwise silently drift from PRJ_CODE_UPSTREAMS.
    `<!-- ${new Set(contributionsData.contributedTo.map((r) => foldProjectName(r.repo, displayName))).size} folded upstream projects known at build time -->`,
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

  const body = await projectsLines(locale, siteUrl);
  const upstream = await upstreamLines(locale);

  return [
    `# ${locale === "es" ? "Proyectos" : "Projects"}`,
    "",
    `Canonical: ${url}`,
    `Language: ${locale}`,
    `Alternate: ${alternateTwinUrl(url, locale)}`,
    `License: ${new URL(locale === "es" ? "/es/license/" : "/license/", url).href}`,
    `Live: ${PRJ.asOf}`,
    "",
    ...body,
    ...upstream,
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
  const totalPrs =
    summary.contributionTotals.prMerged +
    summary.contributionTotals.prOpen +
    summary.contributionTotals.prClosed;
  const totalIssues =
    summary.contributionTotals.issuesOpen +
    summary.contributionTotals.issuesClosed;

  const contributedToStars = new Map(
    contributionsData.contributedTo.map((row) => [row.project, row.stars]),
  );
  const highlightLines = contributionsData.highlights.flatMap((h) => {
    const project = foldProjectName(h.repo, displayName);
    const stars = contributedToStars.get(project);
    const starsNote = stars ? ` (${stars}★)` : "";
    return [
      `- **${h.repo} ${itemRef(h)}**${starsNote}: ${h.why[locale]} (${platformName(h.platform, t)}, ${itemUrl({ ...h, fullName: h.repo })})`,
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
  const notMerged = allItems.filter(
    ({ item }) => item.state === "closed",
  ).length;
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
        `- **${project}** (${platformName(items[0]?.platform, t)}): ${countLabel("summaryMerged", merged, t)}, ${countLabel("summaryOpen", open, t)}`,
        ...items.slice(0, 10).map((it) => `  - ${ledgerItemLabel(it, t)}`),
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
        if (row.merged === 0)
          return `${link} (${t("pages.projectsContributions.underReview")})`;
        const times = row.merged > 1 ? " ×" + String(row.merged) : "";
        return `${link}${times} (${stateLabel("merged", t)})`;
      });
      return `- **${own}**: ${parts.join(", ")}`;
    });

  const answerLines = acceptedAnswers.map(
    (a) => `- ${a.fullName} #${a.number}: [${a.title}](${a.answerUrl})`,
  );

  const achievementLines = achievements.map((a) => {
    if (a.platform !== "gitlab") {
      return `- **${a.name}** (GitHub): ${tierLabel(a.tierName, t)}`;
    }
    const awarded = a.awardedAt
      ? t("pages.projectsContributions.achievementAwarded", {
          date: formatDate(new Date(a.awardedAt), locale),
        })
      : null;
    return awarded
      ? `- **${a.name}** (GitLab): ${awarded}`
      : `- **${a.name}** (GitLab)`;
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
      prs: String(totalPrs),
      issues: String(totalIssues),
      repos: String(summary.contributionTotals.repos),
    }),
    "",
    `- ${t("pages.projects.upstream.tileCodeMerged")}: ${summary.codeVsListingSplit.codeOrDocs.merged}`,
    `- ${t("pages.projects.upstream.tileListingMerged")}: ${summary.codeVsListingSplit.listing.merged}`,
    `- ${t("pages.projects.upstream.tilePrOpen")}: ${summary.codeVsListingSplit.codeOrDocs.open}`,
    `- ${t("pages.projects.upstream.tileAnswers")}: ${summary.answersCount}`,
    "",
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
    `## ${t("pages.projectsContributions.achievementsHeading")}`,
    "",
    ...achievementLines,
    "",
    ...pageFaqLines(
      await getPageFaq("/projects/contributions/", locale),
      locale,
    ),
  ].join("\n");
}
