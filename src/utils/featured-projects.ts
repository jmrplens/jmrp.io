/**
 * The homepage's featured project cards, resolved once for the page AND its
 * markdown twin.
 *
 * Three sources, each chosen so the homepage cannot contradict /projects/:
 *
 * - **Which projects**: `featured_projects` in `site.yaml`, in its order.
 * - **Words**: `projects.yaml`, the curated bilingual copy /projects/ renders
 *   (`cardSummary` when a project's `summary` is too long for a card, else
 *   `summary`). The GitHub description used before was English-only, so the
 *   Spanish homepage showed English prose.
 * - **Stars**: the ghchronicle live summary (see SUMMARY_CANDIDATES,
 *   token `PRJ_<ID>_STARS`), the SAME number nginx substitutes into the
 *   /projects/ cards. The homepage stays build-time on purpose (it is
 *   edge-cached, no `PRJ_*` token may reach it), so this is that figure as of
 *   the build: the two pages agree at deploy time, and /projects/ may run
 *   ahead by the stars gained since. When the summary is missing, stale or
 *   null for a repo, the GitHub API count (`@utils/github-facts`, memoized
 *   per build) stands in, so a host with no ghchronicle still shows a figure.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";

import { asContributionsDataset } from "@components/projects/dataset-types";
import rawContributionsData from "@data/ghc/projects-contributions.json";
import type { Locale } from "@i18n/config";
import { pluralize, type TranslationKey, useTranslations } from "@i18n/utils";
import { featuredRepos } from "@utils/github-facts";
import { getProjects } from "@utils/projects";

import { projectTokenId } from "../../scripts/ghc/roster.mjs";

/**
 * Where the live summary is, first match wins: an explicit
 * `GHC_SUMMARY_PATH`, the file the production timer writes for nginx, then
 * the repo-local copy `astro dev` refreshes.
 */
const SUMMARY_CANDIDATES = [
  process.env.GHC_SUMMARY_PATH,
  "/var/lib/jmrp.io/ghc/projects-summary.json",
  path.join(process.cwd(), ".cache/ghc/projects-summary.json"),
].filter((candidate): candidate is string => Boolean(candidate));

/**
 * Older than this, the summary no longer describes the present: its systemd
 * timer runs every 10 minutes, so two days without a write means it stopped,
 * and the GitHub API reading taken during this build is the fresher figure.
 */
const SUMMARY_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** One featured card, already localized. */
export interface FeaturedProjectCard {
  /** GitHub repository name, also the card title. */
  readonly id: string;
  readonly url: string;
  /** Curated language from `projects.yaml` (the one /projects/ prints). */
  readonly language: string | null;
  /** GitHub's language name for the colour dot, when it differs. */
  readonly githubLanguage: string | null;
  /** Star count, or `null` when neither source knows it. */
  readonly stars: number | null;
  /** Localized one-paragraph summary. */
  readonly summary: string | null;
}

let summaryStarsCache: Map<string, number> | undefined;

/**
 * `PRJ_<ID>_STARS` values from the live summary, or an empty map when the
 * file is absent, unreadable or older than {@link SUMMARY_MAX_AGE_MS}.
 * Read once per build.
 */
function summaryStars(): Map<string, number> {
  if (summaryStarsCache) return summaryStarsCache;
  const stars = new Map<string, number>();
  try {
    const summaryPath = SUMMARY_CANDIDATES.find((candidate) =>
      fs.existsSync(candidate),
    );
    if (!summaryPath) throw new Error("no projects summary");
    const raw = JSON.parse(fs.readFileSync(summaryPath, "utf8")) as {
      generatedAt?: string;
      tokens?: Record<string, unknown>;
    };
    const generatedAt = Date.parse(raw.generatedAt ?? "");
    if (
      Number.isFinite(generatedAt) &&
      Date.now() - generatedAt <= SUMMARY_MAX_AGE_MS
    ) {
      for (const [key, value] of Object.entries(raw.tokens ?? {})) {
        const match = /^PRJ_(.+)_STARS$/.exec(key);
        if (match?.[1] && typeof value === "number" && Number.isFinite(value))
          stars.set(match[1], value);
      }
    }
  } catch {
    // No summary on this host (fresh clone, CI): the API figure stands in.
  }
  summaryStarsCache = stars;
  return stars;
}

/**
 * The featured cards for one locale, in `site.yaml` order. A name missing
 * from `projects.yaml` still renders from the GitHub data alone, and one the
 * API could not reach still renders from `projects.yaml` alone.
 *
 * @param names - `featured_projects` from `site.yaml`.
 * @param locale - Which language the summaries are in.
 * @returns One card per name that either source knows.
 */
export async function featuredProjectCards(
  names: readonly string[],
  locale: Locale,
): Promise<FeaturedProjectCard[]> {
  const [projects, repos] = await Promise.all([
    getProjects(),
    featuredRepos(names),
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const repoByName = new Map(repos.map((r) => [r.name, r]));
  const live = summaryStars();

  return names.flatMap((id) => {
    const project = projectById.get(id);
    const repo = repoByName.get(id);
    if (!project && !repo) return [];
    const summary = project
      ? (project.cardSummary ?? project.summary)[locale]
      : repo?.description;
    return [
      {
        id,
        url:
          repo?.html_url ??
          project?.repo ??
          `https://github.com/jmrplens/${id}`,
        language: project?.language ?? repo?.language ?? null,
        githubLanguage: repo?.language ?? null,
        stars: live.get(projectTokenId(id)) ?? repo?.stargazers_count ?? null,
        summary: summary ?? null,
      },
    ];
  });
}

/**
 * "N code and docs pull requests merged into M other open-source projects,
 * including A, B and C", for the homepage and its markdown twin.
 *
 * BUILD-TIME on purpose, from the same dataset /projects/contributions/
 * renders (`src/data/ghc/projects-contributions.json`): the homepage is
 * served from the edge cache, and a live `PRJ_*` token would send every
 * request back to nginx. Counts are code and docs merges only, the figure
 * /projects/ calls "code & docs" (packaging and listing PRs are counted apart
 * there), and the names are the three most-starred of those projects, the
 * order the dataset already carries.
 *
 * @param locale - Which language to write it in.
 * @returns The sentence, or `null` when the dataset has no merged PR.
 */
export function upstreamSummary(locale: Locale): string | null {
  const t = useTranslations(locale);
  const rows = asContributionsDataset(rawContributionsData).contributedTo;
  const merged = rows.reduce((sum, row) => sum + row.merged, 0);
  if (merged === 0) return null;
  const count = (
    n: number,
    one: TranslationKey,
    other: TranslationKey,
  ): string =>
    pluralize(
      n,
      { one: t(one, { count: n }), other: t(other, { count: n }) },
      locale,
    );
  return t("pages.home.upstreamStrip", {
    prs: count(
      merged,
      "pages.home.upstreamPrsOne",
      "pages.home.upstreamPrsOther",
    ),
    projects: count(
      rows.length,
      "pages.home.upstreamProjectsOne",
      "pages.home.upstreamProjectsOther",
    ),
    names: new Intl.ListFormat(locale, {
      style: "long",
      type: "conjunction",
    }).format(rows.slice(0, 3).map((row) => row.project)),
  });
}
