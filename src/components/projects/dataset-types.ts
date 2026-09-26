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
  /** Repository full name (`owner/repo`, or the GitLab project path). */
  readonly repo: string;
  /** PR/issue number, or the GitLab merge request IID. */
  readonly number: number;
  /** Whether it is a pull/merge request or an issue. */
  readonly kind: "pull_request" | "issue";
  /** Where it lives; absent means GitHub. */
  readonly platform?: ContributionPlatform;
  /** One factual line on why it matters, per locale. */
  readonly why: { readonly en: string; readonly es: string };
  /** True when title and link must not be shown. */
  readonly redacted: boolean;
}

/** One row of the "Contributed to" strip. */
export interface ContributedToItem {
  /** Folded display name of the upstream project. */
  readonly project: string;
  /** The repository used for the star count and the link. */
  readonly repo: string;
  /** Where it lives; absent means GitHub. */
  readonly platform?: ContributionPlatform;
  /** Merged code/docs pull or merge requests into it. */
  readonly merged: number;
  /** ISO date of the latest merge, if any. */
  readonly lastMergedAt: string | null;
  /** Star count, or `null` when it could not be fetched. */
  readonly stars: number | null;
}

/** One accepted GitHub Discussions answer. */
export interface AcceptedAnswerItem {
  /** Repository the discussion belongs to. */
  readonly fullName: string;
  /** Discussion number. */
  readonly number: number;
  /** Discussion title (upstream text, untranslated). */
  readonly title: string;
  /** Permalink to the accepted answer comment. */
  readonly answerUrl: string;
  /** ISO date the answer was posted. */
  readonly answeredAt: string;
}

/** One PR or issue in the full external-contributions ledger. */
export interface LedgerItem {
  /** Where it lives; absent means GitHub. */
  readonly platform?: ContributionPlatform;
  /** Whether it is a pull/merge request or an issue. */
  readonly kind: "pull_request" | "issue";
  /** Current state; `closed` means closed without merging. */
  readonly state: "merged" | "open" | "closed";
  /** Repository full name or GitLab project path. */
  readonly fullName: string;
  /** PR/issue number, or the GitLab merge request IID. */
  readonly number: number;
  /** ISO date it was opened. */
  readonly createdAt: string;
  /** Hours from open to merge, for merged items only. */
  readonly hoursToMerge: number | null;
  /** Comment count at collection time. */
  readonly comments: number;
  /** Upstream title, or `null` when redacted. */
  readonly title: string | null;
  /** True when title and link must not be shown. */
  readonly redacted: boolean;
}

/** Ledger, grouped by creation year then by folded project name. */
export type LedgerByYear = Record<string, Record<string, LedgerItem[]>>;

/** One shown GitHub achievement (`shapeAchievements()`'s output). */
export interface AchievementItem {
  /** Which platform awarded it; absent means GitHub. */
  readonly platform?: ContributionPlatform;
  /** Stable slug, e.g. `pull-shark`. */
  readonly achievement: string;
  /** Display name as the platform shows it. */
  readonly name: string;
  /** Tier multiplier GitHub shows (x2, x3, x4); 1 for the base tier. */
  readonly tierNumber: number;
  /** Tier colour, which also names the badge image. */
  readonly tierName: "gold" | "silver" | "bronze" | "default";
  /** Progress count when known and safe to show, else `null`. */
  readonly count: number | null;
  /** Count needed for the next tier; 0 at the top tier. */
  readonly nextThreshold: number;
  /** Progress towards the next tier, 0 to 100. */
  readonly percent: number;
  /** True when the estimated tier matches the one GitHub shows. */
  readonly agrees: boolean;
  /** GitLab only: when GitLab awarded it. */
  readonly awardedAt?: string | null;
  /** GitLab only: GitLab's own description of the achievement. */
  readonly description?: string | null;
}

/** The raw GitLab.com part (`scripts/gl/collect.mjs`), kept for fallback. */
export interface GitlabPart {
  /** ISO time of the last successful GitLab fetch. */
  readonly fetchedAt: string | null;
  /** GitLab username the data belongs to. */
  readonly username: string | null;
  /** Normalized merge requests and issues. */
  readonly items: readonly LedgerItem[];
  /** Upstream projects referenced by the items, with star counts. */
  readonly projects: readonly {
    readonly fullName: string;
    readonly name: string;
    readonly stars: number | null;
    readonly webUrl: string;
  }[];
}

/** One repo's community-issue-contributor count. */
export interface CommunityIssueRow {
  /** Own repository name. */
  readonly repo: string;
  /** Issues opened by other people. */
  readonly issues: number;
  /** Distinct people who opened them. */
  readonly people: number;
}

/** One repo's community-PR-contributor count. */
export interface CommunityPrRow {
  /** Own repository name. */
  readonly repo: string;
  /** Pull requests opened by other people. */
  readonly prs: number;
  /** Distinct people who opened them. */
  readonly people: number;
}

/** One upstream repo's landed-commit summary. */
export interface UpstreamLandedCommitsRow {
  /** Upstream repository. */
  readonly fullName: string;
  /** Commits by the owner that landed in it. */
  readonly commits: number;
  /** Distinct days with a landed commit. */
  readonly days: number;
  /** ISO date of the first landed commit. */
  readonly firstLandedAt: string;
  /** ISO date of the latest landed commit. */
  readonly lastLandedAt: string;
}

/** One maintained repo's engineering row ("How I maintain the projects"). */
export interface MaintenanceItem {
  /** Own repository name. */
  readonly repo: string;
  /** Days with contributions in the last 12 months. */
  readonly activeDays12m: number;
  /** ISO date of the owner's latest commit. */
  readonly lastOwnerCommitAt: string | null;
  /** CI matrix of the main workflow: job count and runner OSes. */
  readonly ci: {
    readonly repo: string;
    readonly jobs: number;
    readonly os: readonly string[];
  };
  /** Main-branch pass rate over 90 days, or `null`. */
  readonly ciPassRate90d: {
    readonly repo: string;
    readonly ok: number;
    readonly ko: number;
    readonly pct: number;
  } | null;
  /** CodeQL languages and last scan, or `null` when not set up. */
  readonly codeQl: {
    readonly repo: string;
    readonly languages: readonly string[];
    readonly lastScanAt: string;
  } | null;
  /** Repository policy flags (security policy, protection, updates). */
  readonly hygiene: Record<string, unknown> | null;
  /** Latest docs site deploy, or `null` when there is none. */
  readonly docsPublished: {
    readonly fullName: string;
    readonly lastPublishAt: string;
    readonly deploysIn90d: number;
  } | null;
}

/** The full generated dataset. */
export interface ContributionsDataset {
  /** Bumped when the shape changes incompatibly. */
  readonly schemaVersion: number;
  /** ISO time this dataset was written. */
  readonly generatedAt: string;
  /** Freshness of the underlying ghchronicle data. */
  readonly asOf: string;
  /** Totals shown in the tiles and sentences. */
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
  /** Curated highlights, in display order. */
  readonly highlights: readonly HighlightItem[];
  /** Upstream projects with merged work, most-starred first. */
  readonly contributedTo: readonly ContributedToItem[];
  /** Accepted GitHub Discussions answers. */
  readonly acceptedAnswers: readonly AcceptedAnswerItem[];
  /** Code and docs pull/merge requests by year, then project. */
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
  /** Achievements to show, already filtered and shaped. */
  readonly achievements: readonly AchievementItem[];
  /** Issues and PRs other people opened in the owner's repos. */
  readonly communityContributors: {
    readonly issues: readonly CommunityIssueRow[];
    readonly prs: readonly CommunityPrRow[];
  };
  /** Commits the owner landed upstream, per repository. */
  readonly upstreamLandedCommits: readonly UpstreamLandedCommitsRow[];
  /** Dependabot alerts fixed in the maintained repositories. */
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
  /** One engineering row per maintained repository. */
  readonly maintenance: readonly MaintenanceItem[];
  /** Raw GitLab part, kept so a failed fetch can reuse it. */
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
