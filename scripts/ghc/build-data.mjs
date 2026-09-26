/**
 * Builds the BUILD-TIME /projects contributions dataset,
 * `src/data/ghc/projects-contributions.json`: everything the
 * "Contributions to other projects" block, the /projects/contributions/
 * subpage and the "How I maintain projects" table render that is NOT a live
 * `PRJ_*` token — curated highlights, the full ledger grouped by year and
 * project, the "Contributed to" strip, achievements, per-card maintenance
 * signals (CI, CodeQL, Dependabot, docs-published, active days) and repo
 * hygiene.
 *
 * Falls back to the committed `src/data/ghc/fixture.json` (a real snapshot,
 * privacy-filtered exactly like every live run) when InfluxDB is
 * unreachable — CI runners and worktrees have no route to
 * `192.168.0.40:50107`, and the build must still produce a page. This
 * mirrors `ensureDownloadsData`/`setupDownloads` in
 * `src/integrations/pre-build/downloads.ts`.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

import { runWithConcurrency } from "./concurrency.mjs";
import {
  deriveOwnProjects,
  foldProjectName,
  itemKey,
  loadContributionsConfig,
} from "./contributions-yaml.mjs";
import { ensureAchievementBadges } from "./fetch-achievement-badges.mjs";
import { fetchRepoMeta } from "./github-repo-cache.mjs";
import { resolveInfluxConfig } from "./influx.mjs";
import {
  combineSummary,
  gitlabContributedTo,
  loadGitlabPart,
  shapeGitlabAchievements,
} from "./merge-gitlab.mjs";
import {
  getAcceptedAnswers,
  getAchievements,
  getCiMatrix,
  getCiPassRate,
  getCodeQlCoverage,
  getCodeVsListingSplit,
  getCommunityIssueContributors,
  getCommunityPrContributors,
  getContributionTotals,
  getDependabotFixed,
  getDiscussionTotals,
  getDocsPublished,
  getFreshness,
  getFullLedger,
  getLastOwnerCommit,
  getMaintenanceActiveDays,
  getRepoHygiene,
  getUpstreamLandedCommits,
  getUpstreamRepos,
} from "./queries.mjs";
import {
  ACTIVE_REPOS,
  MAINTENANCE_REPOS,
  OWNER,
  SHOWN_ACHIEVEMENTS,
} from "./roster.mjs";

/** Path of the generated dataset, relative to the repository root. */
export const DATA_PATH = "src/data/ghc/projects-contributions.json";

/** Path of the committed fallback fixture, relative to the repository root. */
export const FIXTURE_PATH = "src/data/ghc/fixture.json";

/** How many of this module's InfluxDB queries may run at once — see
 * `scripts/ghc/concurrency.mjs`'s doc comment: this collector's ~20-query
 * main batch (plus a 9-query per-repo follow-up) intermittently aborted
 * under `influx.mjs`'s 20 s timeout when fired all at once. */
const QUERY_CONCURRENCY = 3;

/** Collector families backing this dataset's `asOf` stamp. */
const FRESHNESS_FAMILIES = [
  "outbound",
  "discussions",
  "repo",
  "stars",
  "totals",
  "repo",
  "account",
];

/**
 * Filters achievements to {@link SHOWN_ACHIEVEMENTS} and redacts Pull
 * Shark's raw `count` (2382 on 2026-09-26): it is an AUTHENTICATED search
 * total that includes ~90 private-repo PRs, and `datos.md` is explicit that
 * it must never be printed as a public figure — the tier (`tierName`
 * "gold", `tierNumber` 4, `percent` 100) already says everything that is
 * safe to show, and it is at max tier so no progress bar is needed either.
 * Also drops ghchronicle's `image` URL: the badge is self-hosted under a
 * stable key (`fetch-achievement-badges.mjs`), so the dataset never
 * carries a `github.githubassets.com` address.
 *
 * @param {Awaited<ReturnType<typeof getAchievements>>} achievements - Raw rows.
 * @returns {Awaited<ReturnType<typeof getAchievements>>} Filtered, redacted rows.
 */
export function shapeAchievements(achievements) {
  return achievements
    .filter((row) => SHOWN_ACHIEVEMENTS.has(row.achievement))
    .map(({ image: _image, ...row }) =>
      row.achievement === "pull-shark" ? { ...row, count: null } : row,
    );
}

/**
 * Titles hidden by default (PLAN.md 8.2 #10): a pending-disclosure-shaped
 * title never renders without an explicit, reviewed opt-in in
 * `contributions.yaml`'s `securityTitleAllow`.
 */
const DEFAULT_SECURITY_TITLE_RE = /security|cve|vulnerab/i;

/**
 * Whether a ledger item's title/URL must be redacted from the detailed
 * listing — either it is in `contributions.yaml`'s `exclude` list, or its
 * title matches the default security pattern and nothing in
 * `securityTitleAllow` clears it.
 *
 * @param {{fullName: string, number: number, title: string, kind?: string, platform?: string}} item - A ledger item.
 * @param {import('./contributions-yaml.mjs').ContributionsConfig} contributions - Curation config.
 * @returns {boolean} True when the item must be redacted.
 */
export function isRedacted(item, contributions) {
  if (contributions.exclude.includes(itemKey({ kind: "", ...item })))
    return true;
  if (!DEFAULT_SECURITY_TITLE_RE.test(item.title)) return false;
  return contributions.securityTitleAllow.every(
    (pattern) => !new RegExp(pattern, "i").test(item.title),
  );
}

/**
 * Splits the full outbound ledger three ways: code and docs pull requests
 * by year and folded project, listing/packaging PRs by the account's own
 * project, and issues by folded project. See the call site for the rules.
 *
 * @param {import('./queries.mjs').LedgerItem[]} fullLedger - Every item.
 * @param {import('./contributions-yaml.mjs').ContributionsConfig} contributions - Curation config.
 * @param {Set<string>} listingSet - `contributions.listingRepos` as a set.
 * @returns {{ledgerByYear: object, issuesByProject: object, listingsByOwnProject: object}} The three views.
 */
export function splitLedger(fullLedger, contributions, listingSet) {
  const excludeSet = new Set(contributions.exclude);
  const views = {
    ledgerByYear: {},
    /** @type {Record<string, {open: number, closed: number}>} */
    issuesByProject: {},
    /** @type {Record<string, Record<string, {fullName: string, merged: number, open: number}>>} */
    listingsByOwnProject: {},
  };
  for (const item of fullLedger) {
    if (excludeSet.has(itemKey(item))) continue;
    const project = foldProjectName(item.fullName, contributions.displayName);
    if (item.kind === "issue") {
      countIssue(views.issuesByProject, project, item);
    } else if (item.platform !== "gitlab" && listingSet.has(item.fullName)) {
      // Listing repositories are a GitHub classification; GitLab has none.
      countListing(views.listingsByOwnProject, project, item, contributions);
    } else {
      addToLedger(views.ledgerByYear, project, item, contributions);
    }
  }
  return views;
}

/**
 * Counts one issue under its folded project.
 *
 * @param {Record<string, {open: number, closed: number}>} issuesByProject - Accumulator.
 * @param {string} project - Folded project name.
 * @param {import('./queries.mjs').LedgerItem} item - The issue.
 */
function countIssue(issuesByProject, project, item) {
  issuesByProject[project] ??= { open: 0, closed: 0 };
  issuesByProject[project][item.state === "open" ? "open" : "closed"] += 1;
}

/**
 * Counts one listing PR under every own project its title names. Closed
 * listing PRs are superseded attempts and are dropped.
 *
 * @param {Record<string, Record<string, {fullName: string, merged: number, open: number}>>} listingsByOwnProject - Accumulator.
 * @param {string} project - Folded name of the listing target.
 * @param {import('./queries.mjs').LedgerItem} item - The listing PR.
 * @param {import('./contributions-yaml.mjs').ContributionsConfig} contributions - Curation config.
 */
function countListing(listingsByOwnProject, project, item, contributions) {
  if (item.state === "closed") return;
  const owners = deriveOwnProjects(
    item.title,
    ACTIVE_REPOS,
    contributions.listingAliases,
  );
  for (const own of owners.length > 0 ? owners : ["other"]) {
    listingsByOwnProject[own] ??= {};
    const row = (listingsByOwnProject[own][project] ??= {
      fullName: item.fullName,
      merged: 0,
      open: 0,
    });
    row[item.state === "merged" ? "merged" : "open"] += 1;
  }
}

/**
 * Files one code/docs PR under its creation year and folded project,
 * redacting the title when the curation rules require it.
 *
 * @param {Record<string, Record<string, object[]>>} ledgerByYear - Accumulator.
 * @param {string} project - Folded project name.
 * @param {import('./queries.mjs').LedgerItem} item - The PR or MR.
 * @param {import('./contributions-yaml.mjs').ContributionsConfig} contributions - Curation config.
 */
function addToLedger(ledgerByYear, project, item, contributions) {
  const year = item.createdAt.slice(0, 4);
  ledgerByYear[year] ??= {};
  ledgerByYear[year][project] ??= [];
  const redacted = isRedacted(item, contributions);
  ledgerByYear[year][project].push({
    ...item,
    title: redacted ? null : item.title,
    redacted,
  });
}

/**
 * Runs every build-time query and shapes the dataset. Network-calling;
 * {@link buildDataset} below wraps it with the fixture fallback.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {string} root - Repository root (for `contributions.yaml` and the
 *   GitHub metadata cache).
 * @param {object} [options] - Options.
 * @param {(line: string) => void} [options.warn] - Warning sink.
 * @param {typeof loadGitlabPart} [options.loadGitlab] - Injectable GitLab
 *   loader (tests).
 * @returns {Promise<object>} The dataset, ready to serialize.
 */
export async function collectDataset(
  config,
  root,
  { warn = console.warn, loadGitlab = loadGitlabPart } = {},
) {
  const contributions = loadContributionsConfig(root);
  const listingSet = new Set(contributions.listingRepos);

  const [
    contributionTotals,
    codeVsListingSplit,
    fullLedger,
    acceptedAnswers,
    discussionTotals,
    upstreamRepos,
    achievements,
    freshness,
    issueContributors,
    prContributors,
    upstreamLandedCommits,
    dependabot,
    maintenanceActiveDays,
    lastOwnerCommit,
    ciMatrix,
    ciPassRate,
    codeQl,
    hygiene,
  ] = await runWithConcurrency(
    [
      () => getContributionTotals(config),
      () => getCodeVsListingSplit(config, contributions.listingRepos),
      () => getFullLedger(config),
      () => getAcceptedAnswers(config),
      () => getDiscussionTotals(config),
      () => getUpstreamRepos(config),
      () => getAchievements(config),
      () => getFreshness(config, FRESHNESS_FAMILIES),
      () => getCommunityIssueContributors(config),
      () => getCommunityPrContributors(config),
      () => getUpstreamLandedCommits(config),
      () => getDependabotFixed(config, MAINTENANCE_REPOS),
      () => getMaintenanceActiveDays(config, ACTIVE_REPOS),
      () => getLastOwnerCommit(config, ACTIVE_REPOS),
      () => getCiMatrix(config, MAINTENANCE_REPOS),
      () => getCiPassRate(config, MAINTENANCE_REPOS),
      () => getCodeQlCoverage(config, MAINTENANCE_REPOS),
      () => getRepoHygiene(config, MAINTENANCE_REPOS),
    ],
    QUERY_CONCURRENCY,
  );

  // Self-host the badge artwork for the shown achievements at the tier now
  // held. Never throws; a failure keeps the committed files.
  await ensureAchievementBadges(
    achievements.filter((row) => SHOWN_ACHIEVEMENTS.has(row.achievement)),
    { root },
  );

  // GitLab.com: collected live, or the fixture's GitLab part (only that
  // part) when GitLab.com is unreachable. Never throws.
  const { part: gitlab } = await loadGitlab({
    root,
    fixturePath: path.join(root, FIXTURE_PATH),
    contributions,
    warn,
  });

  const docsPublished = await getDocsPublished(
    config,
    MAINTENANCE_REPOS.map((repo) => `${OWNER}/${repo}`),
  );

  // ── Ledger, split three ways. The code ledger holds code and docs PULL
  // REQUESTS only; listing/packaging PRs go to `listingsByOwnProject`
  // (grouped by the account's own project they publish, derived from the
  // title); issues go to `issuesByProject`. `exclude` removes an item from
  // every list (it still counts in the live summary, which must match
  // GitHub's own search). Closed listing PRs are superseded attempts and are
  // dropped. ──
  const { ledgerByYear, issuesByProject, listingsByOwnProject } = splitLedger(
    [...fullLedger, ...gitlab.items],
    contributions,
    listingSet,
  );

  // ── "Contributed to" strip: folded projects with merged code/docs, ranked
  // by star count (fetched live from GitHub, cached) ──
  /** @type {Map<string, {project: string, merged: number, lastMergedAt: string,
   *   primaryRepo: string}>} */
  const foldedCode = new Map();
  for (const repo of upstreamRepos) {
    if (repo.merged === 0 || listingSet.has(repo.fullName)) continue;
    const project = foldProjectName(repo.fullName, contributions.displayName);
    const existing = foldedCode.get(project);
    if (existing) {
      existing.merged += repo.merged;
      if ((repo.lastMergedAt ?? "") > (existing.lastMergedAt ?? "")) {
        existing.lastMergedAt = repo.lastMergedAt;
      }
      // The repo with the most merges represents the group's star count/link.
      if (
        repo.merged >
        (upstreamRepos.find((r) => r.fullName === existing.primaryRepo)
          ?.merged ?? 0)
      ) {
        existing.primaryRepo = repo.fullName;
      }
    } else {
      foldedCode.set(project, {
        project,
        merged: repo.merged,
        lastMergedAt: repo.lastMergedAt,
        primaryRepo: repo.fullName,
      });
    }
  }
  const repoMeta = await fetchRepoMeta(
    [...foldedCode.values()].map((entry) => entry.primaryRepo),
    { root },
  );
  const contributedTo = [
    ...[...foldedCode.values()].map((entry) => ({
      project: entry.project,
      repo: entry.primaryRepo,
      platform: "github",
      merged: entry.merged,
      lastMergedAt: entry.lastMergedAt,
      stars: repoMeta[entry.primaryRepo]?.stars ?? null,
    })),
    ...gitlabContributedTo(gitlab, contributions.displayName),
  ].sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1));

  // Hours to merge of every merged code/docs PR or MR, both platforms, for
  // the combined median.
  const codeMergeHours = [...fullLedger, ...gitlab.items]
    .filter(
      (item) =>
        item.kind === "pull_request" &&
        item.state === "merged" &&
        item.hoursToMerge !== null &&
        (item.platform === "gitlab" || !listingSet.has(item.fullName)),
    )
    .map((item) => item.hoursToMerge);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    asOf: freshness.asOf,
    summary: combineSummary(
      {
        contributionTotals,
        codeVsListingSplit,
        answersCount: acceptedAnswers.length,
        discussionTotals,
      },
      gitlab.items,
      codeMergeHours,
    ),
    highlights: contributions.featured.map((entry) => ({
      ...entry,
      redacted: false,
    })),
    contributedTo,
    acceptedAnswers,
    ledgerByYear,
    issuesByProject,
    listingsByOwnProject,
    achievements: [
      ...shapeAchievements(achievements).map((row) => ({
        platform: "github",
        ...row,
      })),
      ...shapeGitlabAchievements(gitlab.achievements),
    ],
    communityContributors: { issues: issueContributors, prs: prContributors },
    upstreamLandedCommits,
    dependabot,
    maintenance: MAINTENANCE_REPOS.map((repo) => ({
      repo,
      activeDays12m:
        maintenanceActiveDays.find((r) => r.repo === repo)?.activeDays12m ?? 0,
      lastOwnerCommitAt:
        lastOwnerCommit.find((r) => r.repo === repo)?.lastCommitAt ?? null,
      ci: ciMatrix.find((r) => r.repo === repo) ?? { repo, jobs: 0, os: [] },
      ciPassRate90d: ciPassRate.find((r) => r.repo === repo) ?? null,
      codeQl: codeQl.find((r) => r.repo === repo) ?? null,
      hygiene: hygiene.find((r) => r.repo === repo) ?? null,
      docsPublished:
        docsPublished.find((r) => r.fullName === `${OWNER}/${repo}`) ?? null,
    })),
    // The raw GitLab.com part, kept whole so a build that cannot reach
    // GitLab.com falls back to exactly this part of the committed fixture.
    gitlab,
  };
}

/**
 * Writes {@link DATA_PATH} atomically, falling back to the committed
 * {@link FIXTURE_PATH} on failure.
 *
 * @param {object} options - Options.
 * @param {string} [options.root] - Repository root; defaults to `process.cwd()`.
 * @param {import('./influx.mjs').InfluxConfig} [options.config] - Connection settings.
 * @param {(line: string) => void} [options.log] - Progress sink.
 * @param {(line: string) => void} [options.warn] - Warning sink.
 * @param {(config: import('./influx.mjs').InfluxConfig, root: string,
 *   options: {warn: (line: string) => void}) => Promise<object>}
 *   [options.collect] - Overrides {@link collectDataset}; unit tests use
 *   this to exercise the atomic-write / fixture-fallback logic without a
 *   real InfluxDB connection.
 * @returns {Promise<{wrote: boolean, fromFixture: boolean}>} Outcome.
 */
export async function buildDataset({
  root = process.cwd(),
  config,
  log = () => {},
  warn = console.warn,
  collect = collectDataset,
} = {}) {
  const outPath = path.join(root, DATA_PATH);
  const fixturePath = path.join(root, FIXTURE_PATH);

  try {
    const resolvedConfig = config ?? resolveInfluxConfig();
    const dataset = await collect(resolvedConfig, root, { warn });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const tmpPath = `${outPath}.tmp-${process.pid}`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(dataset, null, 2)}\n`);
    fs.renameSync(tmpPath, outPath);
    log(
      `  ✓ Wrote ${DATA_PATH} (${dataset.highlights.length} highlights, ` +
        `${dataset.contributedTo.length} upstream projects, as_of ${String(dataset.asOf)})`,
    );
    return { wrote: true, fromFixture: false };
  } catch (error) {
    const message = (
      error instanceof Error ? error.message : String(error)
    ).replaceAll(/[\r\n\t]+/g, " ");
    warn(`Could not build the /projects contributions dataset (${message}).`);
    if (!fs.existsSync(fixturePath)) {
      warn(
        `No fixture at ${FIXTURE_PATH} either — leaving ${DATA_PATH} untouched.`,
      );
      return { wrote: false, fromFixture: false };
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.copyFileSync(fixturePath, outPath);
    warn(
      `Copied the committed fixture to ${DATA_PATH} so the build still renders.`,
    );
    return { wrote: true, fromFixture: true };
  }
}

/**
 * Guarantees {@link DATA_PATH} exists (without touching the network),
 * copying the fixture when it does not. Mirrors `ensureDownloadsData`: every
 * command that resolves modules needs the file to exist because pages
 * import it statically.
 *
 * @param {string} [root] - Repository root; defaults to `process.cwd()`.
 * @returns {boolean} Whether the fixture was copied (false when the file
 *   already existed).
 */
export function ensureDataset(root = process.cwd()) {
  const outPath = path.join(root, DATA_PATH);
  if (fs.existsSync(outPath)) return false;
  const fixturePath = path.join(root, FIXTURE_PATH);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.copyFileSync(fixturePath, outPath);
  return true;
}

// Allow `node scripts/ghc/build-data.mjs` to run standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { wrote } = await buildDataset({
    log: (line) => console.log(line),
    warn: (line) => console.warn(line),
  });
  process.exit(wrote ? 0 : 1);
}
