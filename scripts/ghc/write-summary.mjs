/**
 * Writes the LIVE /projects summary JSON: a flat map of `PRJ_*` token →
 * already-validated primitive (number, string or null), plus `as_of`.
 *
 * This is the repo-side half of the architecture
 * `plan/projects-ghchronicle/json-vs-influx.md` recommends: this script (run
 * from a systemd timer on the production host, per PLAN.md section 7.1)
 * queries InfluxDB 3 and writes a small JSON file; a LATER task's nginx Lua
 * module (`projects_ssr_metrics.lua`, not part of this change) reads that
 * file — through the same stale-while-revalidate engine
 * `homelab_ssr_metrics.lua` already runs — and substitutes `PRJ_*` tokens
 * with locale-formatted text. No InfluxDB token or query classification
 * logic ever needs to reach nginx.
 *
 * ── Local development ──────────────────────────────────────────────────
 * `source /etc/ghchronicle/ghchronicle.env && export GHC_INFLUX_TOKEN="$INFLUX_TOKEN"`
 * then `node scripts/ghc/write-summary.mjs`. The token is read-only against
 * the `github` database; see PLAN.md 8.2 #2 for the token-scope decision.
 * NEVER print, log or write the token anywhere — `influx.mjs` already
 * enforces this for its own error messages.
 *
 * ── Failure behavior ──────────────────────────────────────────────────
 * A failed query keeps the previous summary file untouched (the "last good"
 * pattern `refreshDownloadsFile` in `scripts/refresh-downloads.mjs` already
 * uses) and reports the failure through `warn`; it never throws when a
 * previous file exists to fall back to. With no previous file AND a failed
 * fetch, it writes a fully-null summary (every token present, every value
 * `null`) so a downstream consumer that requires every declared key to
 * exist never crashes on a missing key — only on a missing FILE.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

import { runWithConcurrency } from "./concurrency.mjs";
import { loadContributionsConfig } from "./contributions-yaml.mjs";
import { resolveInfluxConfig } from "./influx.mjs";
import {
  getAcceptedAnswers,
  getActivityBand,
  getCodeVsListingSplit,
  getContributionTotals,
  getFreshness,
  getHeaderActivityBand,
  getLatestRelease,
  getStars,
  getUpstreamRepos,
} from "./queries.mjs";
import { ACTIVE_REPOS, projectTokenId } from "./roster.mjs";

/** Default output path, relative to the repository root. */
export const DEFAULT_SUMMARY_PATH = ".cache/ghc/projects-summary.json";

/** Collector families whose oldest successful sweep backs every live number
 * this summary publishes (contributions, stars, releases). */
const FRESHNESS_FAMILIES = [
  "outbound",
  "discussions",
  "repo",
  "stars",
  "totals",
];

/** CSS class applied to a `*_CLASS` token to hide the figure it gates. */
const HIDE_CLASS = "prj-hide";
/** CSS class applied when the figure should render. */
const SHOW_CLASS = "";

/** How many of this module's InfluxDB queries may run at once. Firing all
 * ~10 concurrently intermittently aborted under `influx.mjs`'s 20 s
 * timeout; a small cap plus `influx.mjs`'s own one-retry-on-abort is enough
 * headroom without serializing the whole collection. */
const QUERY_CONCURRENCY = 3;

/**
 * Runs every query the live summary needs and returns the raw shaped
 * results — no token names yet, so this half is independently testable
 * against a live database without asserting on the token contract, and
 * {@link buildSummaryTokens} is independently testable with canned data and
 * no network.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {string} root - Repository root, for reading `contributions.yaml`.
 * @returns {Promise<RawSummaryData>} Raw query results.
 */
export async function collectSummaryData(config, root) {
  const contributions = loadContributionsConfig(root);
  const listingSet = new Set(contributions.listingRepos);

  const [
    contributionTotals,
    codeVsListingSplit,
    upstreamRepos,
    acceptedAnswers,
    headerBand,
    activityBand,
    freshness,
    stars,
    releases,
  ] = await runWithConcurrency(
    [
      () => getContributionTotals(config),
      () => getCodeVsListingSplit(config, contributions.listingRepos),
      () => getUpstreamRepos(config),
      () => getAcceptedAnswers(config),
      () => getHeaderActivityBand(config),
      () => getActivityBand(config),
      () => getFreshness(config, FRESHNESS_FAMILIES),
      () => getStars(config, ACTIVE_REPOS),
      () => getLatestRelease(config, ACTIVE_REPOS),
    ],
    QUERY_CONCURRENCY,
  );

  // Distinct upstream PROJECTS (owner, folded per contributions.yaml's
  // displayName) with at least one merged CODE/DOCS pull request — listing
  // repos excluded, per the owner's "unit of a project" decision.
  const codeUpstreamProjects = new Set(
    upstreamRepos
      .filter((repo) => repo.merged > 0 && !listingSet.has(repo.fullName))
      .map((repo) => contributions.displayName[repo.fullName] ?? repo.fullName),
  );

  return {
    contributionTotals,
    codeVsListingSplit,
    codeUpstreamsCount: codeUpstreamProjects.size,
    answersCount: acceptedAnswers.length,
    headerBand,
    activityBand,
    freshness,
    stars,
    releases,
  };
}

/**
 * @typedef {object} RawSummaryData
 * @property {Awaited<ReturnType<typeof getContributionTotals>>} contributionTotals
 * @property {Awaited<ReturnType<typeof getCodeVsListingSplit>>} codeVsListingSplit
 * @property {number} codeUpstreamsCount
 * @property {number} answersCount
 * @property {Awaited<ReturnType<typeof getHeaderActivityBand>>} headerBand
 * @property {Awaited<ReturnType<typeof getActivityBand>>} activityBand
 * @property {Awaited<ReturnType<typeof getFreshness>>} freshness
 * @property {Awaited<ReturnType<typeof getStars>>} stars
 * @property {Awaited<ReturnType<typeof getLatestRelease>>} releases
 */

/**
 * Shapes {@link RawSummaryData} into the flat `PRJ_*` token map this module
 * publishes — pure and network-free, so it is unit-tested with canned data.
 *
 * Every token declared in `src/components/projects/ssr-tokens.ts` is present
 * in the returned object, `null` where the underlying data is absent, so a
 * consumer that iterates the registry never hits a missing key.
 *
 * @param {RawSummaryData} raw - From {@link collectSummaryData}.
 * @returns {Record<string, number | string | null>} Token → primitive.
 */
export function buildSummaryTokens(raw) {
  /** @type {Record<string, number | string | null>} */
  const tokens = {
    PRJ_CODE_MERGED: raw.codeVsListingSplit.codeOrDocs.merged,
    PRJ_CODE_UPSTREAMS: raw.codeUpstreamsCount,
    PRJ_LISTING_MERGED: raw.codeVsListingSplit.listing.merged,
    // CODE PRs only (excludes contributions.yaml listingRepos) — the owner
    // decided the open-review tile must not blend packaging/listing PRs into
    // the "under review" figure. `contributionTotals.prOpen` (all kinds) is
    // still available for the subpage's book-keeping totals.
    PRJ_PR_OPEN: raw.codeVsListingSplit.codeOrDocs.open,
    PRJ_ANSWERS: raw.answersCount,
    PRJ_RELEASES_90D: raw.headerBand.releases90d,
    PRJ_STARS_30D: raw.headerBand.stars30d,
    PRJ_ACTIVE_DAYS: raw.activityBand.activeDays,
    PRJ_STREAK: raw.activityBand.streakDays,
    PRJ_AS_OF: raw.freshness.asOf,
  };

  const starsByRepo = new Map(raw.stars.map((row) => [row.repo, row]));
  const releaseByRepo = new Map(raw.releases.map((row) => [row.repo, row]));

  for (const repoId of ACTIVE_REPOS) {
    const id = projectTokenId(repoId);
    const star = starsByRepo.get(repoId);
    const release = releaseByRepo.get(repoId);

    tokens[`PRJ_${id}_STARS`] = star ? star.stars : null;
    tokens[`PRJ_${id}_STARS_30D`] = star ? star.stars30d : null;
    // A card with no stars shows no stars row: "0" reads as a verdict.
    tokens[`PRJ_${id}_STARS_CLASS`] =
      star && star.stars > 0 ? SHOW_CLASS : HIDE_CLASS;
    tokens[`PRJ_${id}_STARS_30D_CLASS`] =
      star && star.stars30d > 0 ? SHOW_CLASS : HIDE_CLASS;

    tokens[`PRJ_${id}_REL_TAG`] = release ? release.tag : null;
    tokens[`PRJ_${id}_REL_AGE`] = release ? release.ageDays : null;
    tokens[`PRJ_${id}_REL_CLASS`] = release ? SHOW_CLASS : HIDE_CLASS;
  }

  return tokens;
}

/**
 * Builds a fully-null summary (every card token declared, every value
 * `null`) — the degraded state written only when NO previous summary exists
 * and the live fetch also failed, so a consumer sees "no data everywhere"
 * instead of a missing file.
 *
 * @returns {Record<string, number | string | null>} Token → `null` (mostly).
 */
export function buildNullSummary() {
  const globalKeys = [
    "PRJ_CODE_MERGED",
    "PRJ_CODE_UPSTREAMS",
    "PRJ_LISTING_MERGED",
    "PRJ_PR_OPEN",
    "PRJ_ANSWERS",
    "PRJ_RELEASES_90D",
    "PRJ_STARS_30D",
    "PRJ_ACTIVE_DAYS",
    "PRJ_STREAK",
    "PRJ_AS_OF",
  ];
  /** @type {Record<string, number | string | null>} */
  const tokens = Object.fromEntries(globalKeys.map((key) => [key, null]));
  for (const repoId of ACTIVE_REPOS) {
    const id = projectTokenId(repoId);
    tokens[`PRJ_${id}_STARS`] = null;
    tokens[`PRJ_${id}_STARS_30D`] = null;
    tokens[`PRJ_${id}_STARS_CLASS`] = HIDE_CLASS;
    tokens[`PRJ_${id}_STARS_30D_CLASS`] = HIDE_CLASS;
    tokens[`PRJ_${id}_REL_TAG`] = null;
    tokens[`PRJ_${id}_REL_AGE`] = null;
    tokens[`PRJ_${id}_REL_CLASS`] = HIDE_CLASS;
  }
  return tokens;
}

/**
 * Writes `data` to `outPath` atomically (temp file + rename), creating the
 * parent directory if needed.
 *
 * @param {string} outPath - Absolute path to write.
 * @param {Record<string, unknown>} data - JSON-serializable payload.
 */
function writeJsonAtomic(outPath, data) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const tmpPath = `${outPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmpPath, outPath);
}

/**
 * Refreshes the live /projects summary JSON at `outPath` (default
 * {@link DEFAULT_SUMMARY_PATH} under `root`).
 *
 * @param {object} [options] - Options.
 * @param {string} [options.root] - Repository root; defaults to `process.cwd()`.
 * @param {string} [options.outPath] - Absolute output path; overrides `root`-relative default.
 * @param {import('./influx.mjs').InfluxConfig} [options.config] - Connection
 *   settings; defaults to {@link resolveInfluxConfig}.
 * @param {(line: string) => void} [options.log] - Progress sink.
 * @param {(line: string) => void} [options.warn] - Warning sink.
 * @param {(config: import('./influx.mjs').InfluxConfig, root: string) => Promise<RawSummaryData>}
 *   [options.collect] - Overrides {@link collectSummaryData}; unit tests use
 *   this to avoid a real InfluxDB connection while exercising the real
 *   atomic-write / last-good-on-failure logic below.
 * @returns {Promise<{
 *   tokens: Record<string, number | string | null>,
 *   wrote: boolean,
 *   refreshed: boolean,
 * }>} The tokens now on disk; whether this call wrote the file at all
 *   (`false` only for the "keep the existing file untouched" fallback); and
 *   whether the tokens are FRESH live data (`false` for both fallbacks, so a
 *   caller — e.g. a systemd `OnFailure=` — can alert on `!refreshed` even
 *   though the file on disk is always valid JSON either way).
 */
export async function writeProjectsSummary({
  root = process.cwd(),
  outPath,
  config,
  log = () => {},
  warn = console.warn,
  collect = collectSummaryData,
} = {}) {
  const resolvedOutPath = outPath ?? path.join(root, DEFAULT_SUMMARY_PATH);
  const resolvedConfig = config ?? resolveInfluxConfig();

  try {
    const raw = await collect(resolvedConfig, root);
    const tokens = buildSummaryTokens(raw);
    writeJsonAtomic(resolvedOutPath, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      tokens,
    });
    log(
      `  ✓ Wrote ${resolvedOutPath} (${Object.keys(tokens).length} tokens, ` +
        `as_of ${String(tokens.PRJ_AS_OF)})`,
    );
    return { tokens, wrote: true, refreshed: true };
  } catch (error) {
    const message = (
      error instanceof Error ? error.message : String(error)
    ).replaceAll(/[\r\n\t]+/g, " ");
    if (fs.existsSync(resolvedOutPath)) {
      warn(
        `Could not refresh the /projects summary (${message}). Keeping the existing ${resolvedOutPath}.`,
      );
      const existing = JSON.parse(fs.readFileSync(resolvedOutPath, "utf8"));
      return { tokens: existing.tokens, wrote: false, refreshed: false };
    }
    warn(
      `Could not refresh the /projects summary (${message}) and no cached ` +
        `file exists. Writing a fully-null summary so consumers see "no data" ` +
        "rather than a missing file.",
    );
    const tokens = buildNullSummary();
    writeJsonAtomic(resolvedOutPath, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      tokens,
    });
    return { tokens, wrote: true, refreshed: false };
  }
}

// Allow `node scripts/ghc/write-summary.mjs` to run standalone. In
// production the systemd timer sets GHC_SUMMARY_PATH to the file nginx
// serves on /stats/projects (/var/lib/jmrp.io/ghc/projects-summary.json).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { refreshed } = await writeProjectsSummary({
    outPath: process.env.GHC_SUMMARY_PATH || undefined,
    log: (line) => console.log(line),
    warn: (line) => console.warn(line),
  });
  process.exit(refreshed ? 0 : 1);
}
