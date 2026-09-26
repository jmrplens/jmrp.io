/**
 * TypeScript shape of `src/data/ghc/projects-contributions.json`
 * (`scripts/ghc/build-data.mjs`'s output), used to cast the statically
 * imported JSON in `ProjectsPage.astro`, `ContributionsPage.astro` and
 * `projects-markdown.ts`.
 *
 * Why a cast instead of relying on `resolveJsonModule`'s inferred type:
 * TypeScript infers a JSON import's object-valued fields as their EXACT
 * literal shape from the file on disk — `ledgerByYear`'s keys become the
 * literal union of the year strings the current dataset happens to have
 * (`"2018" | "2021" | ...`), with no index signature, so indexing it with a
 * plain `string` (`ledgerByYear[year]`) is a type error. That shape is
 * correct for the exact file that produced it and wrong for the type this
 * data actually has: this is generated, refreshed content, whose keys are
 * only known at runtime. Casting once, here, to a real `Record<string, …>`
 * shape is the honest fix — narrowing every call site's `year`/`project`
 * variable individually would fight the inferred type forever.
 *
 * @module
 */

/** Where a contribution lives. Absent in datasets older than GitLab support. */
export type ContributionPlatform = "github" | "gitlab";

/** One curated highlight (`contributions.yaml`'s `featured`). */
export interface HighlightItem {
  readonly repo: string;
  readonly number: number;
  readonly kind: "pull_request" | "issue";
  readonly platform?: ContributionPlatform;
  readonly why: { readonly en: string; readonly es: string };
  readonly redacted: boolean;
}

/** One row of the "Contributed to" strip. */
export interface ContributedToItem {
  readonly project: string;
  readonly repo: string;
  readonly platform?: ContributionPlatform;
  readonly merged: number;
  readonly lastMergedAt: string | null;
  readonly stars: number | null;
}

/** One accepted GitHub Discussions answer. */
export interface AcceptedAnswerItem {
  readonly fullName: string;
  readonly number: number;
  readonly title: string;
  readonly answerUrl: string;
  readonly answeredAt: string;
}

/** One PR or issue in the full external-contributions ledger. */
export interface LedgerItem {
  readonly platform?: ContributionPlatform;
  readonly kind: "pull_request" | "issue";
  readonly state: "merged" | "open" | "closed";
  readonly fullName: string;
  readonly number: number;
  readonly createdAt: string;
  readonly hoursToMerge: number | null;
  readonly comments: number;
  readonly title: string | null;
  readonly redacted: boolean;
}

/** Ledger, grouped by creation year then by folded project name. */
export type LedgerByYear = Record<string, Record<string, LedgerItem[]>>;

/** One shown GitHub achievement (`shapeAchievements()`'s output). */
export interface AchievementItem {
  readonly platform?: ContributionPlatform;
  readonly achievement: string;
  readonly name: string;
  readonly tierNumber: number;
  readonly tierName: "gold" | "silver" | "bronze" | "default";
  readonly count: number | null;
  readonly nextThreshold: number;
  readonly percent: number;
  readonly agrees: boolean;
  /** GitLab only: when GitLab awarded it. */
  readonly awardedAt?: string | null;
  /** GitLab only: GitLab's own description of the achievement. */
  readonly description?: string | null;
}

/** The raw GitLab.com part (`scripts/gl/collect.mjs`), kept for fallback. */
export interface GitlabPart {
  readonly fetchedAt: string | null;
  readonly username: string | null;
  readonly items: readonly LedgerItem[];
  readonly projects: readonly {
    readonly fullName: string;
    readonly name: string;
    readonly stars: number | null;
    readonly webUrl: string;
  }[];
}

/** One repo's community-issue-contributor count. */
export interface CommunityIssueRow {
  readonly repo: string;
  readonly issues: number;
  readonly people: number;
}

/** One repo's community-PR-contributor count. */
export interface CommunityPrRow {
  readonly repo: string;
  readonly prs: number;
  readonly people: number;
}

/** One upstream repo's landed-commit summary. */
export interface UpstreamLandedCommitsRow {
  readonly fullName: string;
  readonly commits: number;
  readonly days: number;
  readonly firstLandedAt: string;
  readonly lastLandedAt: string;
}

/** One maintained repo's engineering row ("How I maintain the projects"). */
export interface MaintenanceItem {
  readonly repo: string;
  readonly activeDays12m: number;
  readonly lastOwnerCommitAt: string | null;
  readonly ci: {
    readonly repo: string;
    readonly jobs: number;
    readonly os: readonly string[];
  };
  readonly ciPassRate90d: {
    readonly repo: string;
    readonly ok: number;
    readonly ko: number;
    readonly pct: number;
  } | null;
  readonly codeQl: {
    readonly repo: string;
    readonly languages: readonly string[];
    readonly lastScanAt: string;
  } | null;
  readonly hygiene: Record<string, unknown> | null;
  readonly docsPublished: {
    readonly fullName: string;
    readonly lastPublishAt: string;
    readonly deploysIn90d: number;
  } | null;
}

/** The full generated dataset. */
export interface ContributionsDataset {
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly asOf: string;
  readonly summary: {
    readonly contributionTotals: {
      readonly prMerged: number;
      readonly prOpen: number;
      readonly prClosed: number;
      readonly issuesOpen: number;
      readonly issuesClosed: number;
      readonly repos: number;
      readonly owners: number;
      readonly reposWithMerge: number;
      readonly lastPrDate: string | null;
    };
    readonly codeVsListingSplit: {
      readonly codeOrDocs: {
        readonly merged: number;
        readonly open: number;
        readonly closed: number;
        readonly reposMerged: number;
        readonly medianHoursToMerge: number | null;
      };
      readonly listing: {
        readonly merged: number;
        readonly open: number;
        readonly closed: number;
        readonly reposMerged: number;
        readonly medianHoursToMerge: number | null;
      };
    };
    readonly answersCount: number;
    readonly discussionTotals: {
      readonly comments: number;
      readonly discussions: number;
      readonly repos: number;
    };
    /** PR/MR and issue counts per platform (the totals above are sums). */
    readonly byPlatform?: Readonly<
      Record<
        ContributionPlatform,
        { readonly prs: number; readonly issues: number }
      >
    >;
  };
  readonly highlights: readonly HighlightItem[];
  readonly contributedTo: readonly ContributedToItem[];
  readonly acceptedAnswers: readonly AcceptedAnswerItem[];
  readonly ledgerByYear: LedgerByYear;
  /** Issues opened in other people's repositories, by folded project. */
  readonly issuesByProject: Readonly<
    Record<string, { readonly open: number; readonly closed: number }>
  >;
  /** Listing/packaging PRs, by own roster project, then by listing target. */
  readonly listingsByOwnProject: Readonly<
    Record<
      string,
      Readonly<
        Record<
          string,
          {
            readonly fullName: string;
            readonly merged: number;
            readonly open: number;
          }
        >
      >
    >
  >;
  readonly achievements: readonly AchievementItem[];
  readonly communityContributors: {
    readonly issues: readonly CommunityIssueRow[];
    readonly prs: readonly CommunityPrRow[];
  };
  readonly upstreamLandedCommits: readonly UpstreamLandedCommitsRow[];
  readonly dependabot: {
    readonly perRepo: readonly {
      readonly repo: string;
      readonly fixed: number;
      readonly medianDays: number | null;
    }[];
    readonly total: number;
    readonly medianDays: number | null;
    readonly within7Days: number;
  };
  readonly maintenance: readonly MaintenanceItem[];
  readonly gitlab?: GitlabPart;
}

/**
 * Casts the statically-imported JSON to {@link ContributionsDataset}. Routed
 * through `unknown` deliberately — see the module doc comment.
 *
 * @param data - The raw JSON import.
 * @returns The same object, typed.
 */
export function asContributionsDataset(data: unknown): ContributionsDataset {
  return data as ContributionsDataset;
}
