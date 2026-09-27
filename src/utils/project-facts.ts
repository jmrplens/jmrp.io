/**
 * Formatting shared by `/projects/`, `/projects/contributions/` and their
 * markdown twins, so the page and its machine-readable copy cannot say two
 * different things about the same figure.
 *
 * Each helper used to live inside one `.astro` frontmatter (the maintenance
 * table's OS order and CodeQL labels, the card's community line, the
 * contributions ledger's merge durations and "see all" links). The twins
 * could not import them from there, so they printed less than the page:
 * GEO twin audit 2026-09-27, W2 to W4.
 *
 * @module
 */

import type {
  ContributionsDataset,
  MaintenanceItem,
} from "@components/projects/dataset-types";
import type { Locale } from "@i18n/config";
import { pluralize, useTranslations } from "@i18n/utils";

import { repoUrl } from "./contribution-links";

/** CodeQL language ids as the maintenance table names them. */
const CODEQL_LABELS: Record<string, string> = {
  go: "Go",
  python: "Python",
  "javascript-typescript": "JS/TS",
  "c-cpp": "C/C++",
  "java-kotlin": "Java/Kotlin",
  ruby: "Ruby",
  swift: "Swift",
};

/** Runner OS order in the "CI on" column; unknown names sort last. */
const OS_ORDER = ["Linux", "macOS", "Windows"];

/**
 * CI runner OSes in the table's fixed order (Linux, macOS, Windows, then the
 * rest).
 *
 * @param os - Runner OS names as the dataset lists them.
 * @returns A sorted copy.
 */
export function sortCiOs(os: readonly string[]): string[] {
  return [...os].sort(
    (a, b) => (OS_ORDER.indexOf(a) + 1 || 99) - (OS_ORDER.indexOf(b) + 1 || 99),
  );
}

/**
 * The CodeQL cell: every scanned language except the `actions` workflow
 * scan, with its display name.
 *
 * @param languages - CodeQL language ids.
 * @returns A comma-separated label.
 */
export function codeQlLabel(languages: readonly string[]): string {
  return languages
    .filter((lang) => lang !== "actions")
    .map((lang) => CODEQL_LABELS[lang] ?? lang)
    .join(", ");
}

/** One row of the "How I maintain the projects" table, already shaped. */
export interface MaintenanceRow {
  /** Display name of the project. */
  readonly projectName: string;
  /** CI matrix, or `null` when no runner OS is known. */
  readonly ci: { readonly jobs: number; readonly os: readonly string[] } | null;
  /** Main-branch pass rate over 90 days, or `null` while not computed. */
  readonly ciPassRate90d: { readonly pct: number } | null;
  /** CodeQL languages, or `null` when CodeQL is not set up. */
  readonly codeQl: { readonly languages: readonly string[] } | null;
}

/**
 * Shapes the dataset's maintenance entries into table rows.
 *
 * @param maintenance - The dataset's `maintenance` array.
 * @param nameById - Repository name to project display name.
 * @returns One row per maintained repository, in dataset order.
 */
export function maintenanceRows(
  maintenance: readonly MaintenanceItem[],
  nameById: ReadonlyMap<string, string>,
): MaintenanceRow[] {
  return maintenance.map((m) => ({
    projectName: nameById.get(m.repo) ?? m.repo,
    ci: m.ci.os.length > 0 ? { jobs: m.ci.jobs, os: m.ci.os } : null,
    ciPassRate90d: m.ciPassRate90d,
    codeQl:
      m.codeQl && m.codeQl.languages.length > 0
        ? { languages: m.codeQl.languages }
        : null,
  }));
}

/**
 * The three text cells of a maintenance row after the project name, exactly
 * as the table prints them.
 *
 * @param row - The shaped row.
 * @param locale - Which locale's "no data" wording.
 * @returns `ciOn`, `jobs`, `passRate` and `codeQl` cell texts.
 */
export function maintenanceCells(
  row: MaintenanceRow,
  locale: Locale,
): { ciOn: string; jobs: string; passRate: string; codeQl: string } {
  const t = useTranslations(locale);
  const noData = t("pages.projects.maintenance.noData");
  return {
    ciOn: row.ci ? sortCiOs(row.ci.os).join(", ") : noData,
    jobs: row.ci ? String(row.ci.jobs) : noData,
    passRate: row.ciPassRate90d
      ? `${row.ciPassRate90d.pct.toFixed(1)}%`
      : t("pages.projects.maintenance.passRatePending"),
    codeQl:
      row.codeQl && row.codeQl.languages.length > 0
        ? codeQlLabel(row.codeQl.languages)
        : noData,
  };
}

/**
 * The Dependabot sentence under the maintenance table, or `null` when no
 * alert was ever fixed.
 *
 * @param dependabot - The dataset's `dependabot` block.
 * @param locale - Which locale.
 * @returns The sentence, or `null`.
 */
export function dependabotSentence(
  dependabot: ContributionsDataset["dependabot"],
  locale: Locale,
): string | null {
  if (dependabot.total <= 0) return null;
  return useTranslations(locale)(
    "pages.projects.maintenance.dependabotSentence",
    {
      fixed: dependabot.total,
      repos: dependabot.perRepo.length,
      days: Math.round(dependabot.medianDays ?? 0),
    },
  );
}

/** Keys of the card's pluralized counters. */
type CountKey = "issueCount" | "prCount" | "peopleCount";

/**
 * A card's "Community" line ("3 issues from 3 people · 6 PRs from 4
 * people"), or `null` when neither side met the display threshold.
 *
 * @param issues - Issues other people opened, when shown.
 * @param prs - Pull requests other people opened, when shown.
 * @param locale - Which locale.
 * @returns The line, or `null`.
 */
export function communityLine(
  issues: { issues: number; people: number } | undefined,
  prs: { prs: number; people: number } | undefined,
  locale: Locale,
): string | null {
  const t = useTranslations(locale);
  const countOf = (key: CountKey, count: number): string =>
    pluralize(
      count,
      {
        one: t(`pages.projects.card.${key}One`, { count }),
        other: t(`pages.projects.card.${key}`, { count }),
      },
      locale,
    );
  const parts: string[] = [];
  if (issues) {
    parts.push(
      t("pages.projects.card.countFromPeople", {
        count: countOf("issueCount", issues.issues),
        people: countOf("peopleCount", issues.people),
      }),
    );
  }
  if (prs) {
    parts.push(
      t("pages.projects.card.countFromPeople", {
        count: countOf("prCount", prs.prs),
        people: countOf("peopleCount", prs.people),
      }),
    );
  }
  // Separator, not translatable prose: both locales use "·" on this page.
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Community rows with fewer people than this are not shown. */
export const COMMUNITY_MIN_PEOPLE = 2;

/**
 * The community figures a card shows for one repository, after the
 * threshold.
 *
 * @param community - The dataset's `communityContributors` block.
 * @param repo - Own repository name.
 * @returns The issue and PR rows that pass the threshold.
 */
export function communityFor(
  community: ContributionsDataset["communityContributors"],
  repo: string,
): {
  issues?: { issues: number; people: number };
  prs?: { prs: number; people: number };
} {
  return {
    issues: community.issues.find(
      (r) => r.repo === repo && r.people >= COMMUNITY_MIN_PEOPLE,
    ),
    prs: community.prs.find(
      (r) => r.repo === repo && r.people >= COMMUNITY_MIN_PEOPLE,
    ),
  };
}

/**
 * Items a ledger entry lists before it says "showing the N most recent" and
 * links to the full listing.
 */
export const LEDGER_MAX_ITEMS = 10;

/** Active days at or below this are not worth a line on a card. */
export const ACTIVITY_MIN_DAYS = 5;

/**
 * A merge duration as the ledger prints it: hours under a day, then whole
 * days with the plural form.
 *
 * @param hours - Hours from opening to merge.
 * @param locale - Which locale.
 * @returns "6 h", "1 day", "12 days", localized.
 */
export function formatMergeDuration(hours: number, locale: Locale): string {
  const t = useTranslations(locale);
  if (hours < 24) {
    return t("pages.projectsContributions.durationHours", {
      count: Math.round(hours),
    });
  }
  const count = Math.round(hours / 24);
  return pluralize(
    count,
    {
      one: t("pages.projectsContributions.durationDaysOne", { count }),
      other: t("pages.projectsContributions.durationDays", { count }),
    },
    locale,
  );
}

/**
 * The GitLab listing of the owner's merge requests to the project a ledger
 * entry mostly targets, for the "showing the N most recent" note.
 *
 * @param items - The entry's items.
 * @param username - The GitLab username.
 * @returns The target project path and the listing URL.
 */
export function gitlabListing(
  items: readonly { fullName: string }[],
  username: string,
): { repo: string; url: string } {
  const counts = new Map<string, number>();
  for (const it of items)
    counts.set(it.fullName, (counts.get(it.fullName) ?? 0) + 1);
  const [repo] = [...counts].sort((a, b) => b[1] - a[1])[0];
  const params = new URLSearchParams({
    author_username: username,
    state: "all",
  });
  return {
    repo,
    url: `${repoUrl(repo, "gitlab")}/-/merge_requests?${params.toString()}`,
  };
}

/**
 * A GitHub search for every pull request the owner opened in the entry's
 * repositories, for the "showing the N most recent" note.
 *
 * @param items - The entry's items.
 * @param owner - The GitHub login.
 * @returns The search URL.
 */
export function githubSearchUrl(
  items: readonly { fullName: string }[],
  owner: string,
): string {
  const repos = [...new Set(items.map((it) => it.fullName))]
    .map((fullName) => `repo:${fullName}`)
    .join(" ");
  const query = `is:pr author:${owner} ${repos}`;
  return `https://github.com/search?type=pullrequests&q=${encodeURIComponent(query)}`;
}
