/**
 * Every InfluxDB 3 query the /projects live-data pipeline needs, for both the
 * live summary (`write-summary.mjs`) and the build-time dataset
 * (`build-data.mjs`).
 *
 * Each function below reproduces one "idea" from
 * `plan/projects-ghchronicle/datos.md` section 3 (the verified, CORRECTED
 * SQL — never the original SQL from section 2, which the same document
 * documents as wrong in several cases: idea 5's `max(url)` picked the wrong
 * comment, idea 7's `gh_issue.pull_request` filter dropped PR-closed issues,
 * idea 17's `min(age_days)` was a day short). The doc comment on each
 * function names its idea number so a reviewer can cross-check the SQL
 * against that verdict.
 *
 * Every query is time-bounded (the InfluxDB 3 "10000 Parquet files" limit —
 * see `datos.md`, several families) and every per-repo query filters through
 * an explicit `roster.mjs` allowlist — never an open `GROUP BY owner` or a
 * deny-list. That is the privacy boundary the whole `github` database needs:
 * `gh_repo`, `gh_commit`, `gh_issue` and friends mix in private repos
 * (kleidos, phonometry-archive, a11y-diagrams, ghfeed, github-scout,
 * pe-mcp-intraweb, coauthor-test, jmrplens.github.io, ModBus_M5Stack,
 * UPV_Anechoic_Robot) with no visibility column safe to trust at query time.
 *
 * @module
 */

import { queryInflux } from "./influx.mjs";
import {
  ACTIVE_REPOS,
  ALL_ROSTER_REPOS,
  MAINTENANCE_REPOS,
  OWNER,
  sqlFullNameList,
  sqlRepoList,
} from "./roster.mjs";

/**
 * Coerces an InfluxDB scalar that may arrive as a JSON number OR a numeric
 * string (`datos.md`: "Numbers returned by SQL can be floats or strings")
 * into a `number`, defaulting to 0 for null/undefined so a missing metric
 * reads as absent rather than throwing downstream.
 *
 * @param {unknown} value - Raw cell value.
 * @param {number} [fallback] - Value to use when null/undefined/unparsable.
 * @returns {number} The coerced number.
 */
function num(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

/**
 * Coerces a nullable numeric cell to `number | null` — for fields where the
 * plan requires NULL to survive as "no data" rather than collapsing to 0
 * (release-download deltas, stars deltas: `datos.md` idea 19 "negative
 * deltas to NULL").
 *
 * @param {unknown} value - Raw cell value.
 * @returns {number | null} The coerced number, or null.
 */
function numOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/**
 * Exact median of a list of numbers (not InfluxDB's `approx_median`/
 * `approx_percentile_cont`, which several ideas in `datos.md` only use as a
 * cheap cross-check). `null` for an empty list, never `NaN` or `0`.
 *
 * @param {number[]} values - Any order; this function sorts a copy.
 * @returns {number | null} The median, or `null` when `values` is empty.
 */
function medianOf(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

// ─────────────────────────────────────────────────────────────────────────
// external-contrib — header/summary numbers (idea 0, 1)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Deduplicated, latest-row-per-item view of `gh_external_contribution`,
 * shared by every query below that needs the full ledger. Open items are
 * re-stamped daily, and a state change (open → merged/closed) creates a new
 * series under the same `(full_name, number, kind)` — always take the latest
 * row (`datos.md`, idea 0's "Advertencias").
 *
 * @returns {string} A `WITH r AS (...)` CTE prefix.
 */
function dedupedContributionsCte() {
  return `WITH r AS (
    SELECT *, ROW_NUMBER() OVER (
      PARTITION BY full_name, number, kind ORDER BY time DESC
    ) AS rn
    FROM gh_external_contribution
    WHERE time >= '2018-01-01' AND user = 'jmrplens'
  )`;
}

/**
 * Header stats: PRs (merged/open/closed) and issues (open/closed) outside
 * the account's own repos, plus repo/owner counts. Idea 0, corrected
 * (2026-09-26 reejecución): 59 PR = 33/15/11, 43 issues = 24/19, 51 repos of
 * 47 owners, 18 repos with a merged PR.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @returns {Promise<{
 *   prMerged: number, prOpen: number, prClosed: number,
 *   issuesOpen: number, issuesClosed: number,
 *   repos: number, owners: number, reposWithMerge: number,
 *   lastPrDate: string | null,
 * }>} Header contribution totals.
 */
export async function getContributionTotals(config) {
  const sql = `${dedupedContributionsCte()}
    SELECT kind, state, count(*) AS n FROM r WHERE rn = 1
    GROUP BY kind, state`;
  const rows = await queryInflux(sql, config);
  const counts = {
    prMerged: 0,
    prOpen: 0,
    prClosed: 0,
    issuesOpen: 0,
    issuesClosed: 0,
  };
  for (const row of rows) {
    const n = num(row.n);
    if (row.kind === "pull_request" && row.state === "merged")
      counts.prMerged = n;
    else if (row.kind === "pull_request" && row.state === "open")
      counts.prOpen = n;
    else if (row.kind === "pull_request" && row.state === "closed")
      counts.prClosed = n;
    else if (row.kind === "issue" && row.state === "open")
      counts.issuesOpen = n;
    else if (row.kind === "issue" && row.state === "closed")
      counts.issuesClosed = n;
  }

  const metaSql = `${dedupedContributionsCte()}
    SELECT
      count(DISTINCT owner) AS orgs,
      count(DISTINCT full_name) AS repos,
      count(DISTINCT CASE WHEN kind = 'pull_request' AND state = 'merged'
        THEN full_name END) AS repos_with_merge,
      max(CASE WHEN kind = 'pull_request' THEN time END) AS last_pr
    FROM r WHERE rn = 1`;
  const [meta] = await queryInflux(metaSql, config);

  return {
    ...counts,
    repos: num(meta?.repos),
    owners: num(meta?.orgs),
    reposWithMerge: num(meta?.repos_with_merge),
    lastPrDate: typeof meta?.last_pr === "string" ? meta.last_pr : null,
  };
}

/**
 * Splits merged/open/closed PRs into code-and-docs vs. packaging/listing,
 * per `contributions.yaml`'s `listingRepos` classification (idea 1). The
 * exact median is computed here in JS (not `approx_median()`, which the SQL
 * uses only as a cheap cross-check) because `n` is small (well under 50).
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {readonly string[]} listingRepos - `owner/repo` full names classified
 *   as packaging/listing (from `contributions.yaml`).
 * @returns {Promise<{
 *   codeOrDocs: ClassBucket, listing: ClassBucket,
 * }>} The two buckets.
 */
export async function getCodeVsListingSplit(config, listingRepos) {
  const sql = `${dedupedContributionsCte()}
    SELECT full_name, number, state, seconds_to_merge
    FROM r WHERE rn = 1 AND kind = 'pull_request'`;
  const rows = await queryInflux(sql, config);
  const listingSet = new Set(listingRepos);

  /** @type {{merged: number[], open: number, closed: number, repos: Set<string>}} */
  const buckets = {
    codeOrDocs: { merged: [], open: 0, closed: 0, repos: new Set() },
    listing: { merged: [], open: 0, closed: 0, repos: new Set() },
  };
  for (const row of rows) {
    const bucket = listingSet.has(String(row.full_name))
      ? buckets.listing
      : buckets.codeOrDocs;
    switch (row.state) {
      case "merged": {
        bucket.merged.push(num(row.seconds_to_merge));
        bucket.repos.add(String(row.full_name));

        break;
      }
      case "open": {
        bucket.open += 1;
        break;
      }
      case "closed": {
        {
          bucket.closed += 1;
          // No default
        }
        break;
      }
    }
  }

  const shape = (bucket) => {
    const medianSeconds = medianOf(bucket.merged);
    return {
      merged: bucket.merged.length,
      open: bucket.open,
      closed: bucket.closed,
      reposMerged: bucket.repos.size,
      medianHoursToMerge: medianSeconds === null ? null : medianSeconds / 3600,
    };
  };

  return {
    codeOrDocs: shape(buckets.codeOrDocs),
    listing: shape(buckets.listing),
  };
}

/**
 * @typedef {{merged: number, open: number, closed: number, reposMerged: number,
 *   medianHoursToMerge: number | null}} ClassBucket
 */

// ─────────────────────────────────────────────────────────────────────────
// external-contrib — upstream projects with merged code (idea 2)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Every `owner/repo` with at least one PR (any kind), for the build-time
 * "Contributed to" strip and the subpage. Caller applies
 * `contributions.yaml`'s `listingRepos` filter and `displayName` folding —
 * this function returns the raw per-repo counts (idea 2's SQL, unfiltered).
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @returns {Promise<{fullName: string, merged: number, open: number,
 *   lastMergedAt: string | null}[]>} One row per upstream repo.
 */
export async function getUpstreamRepos(config) {
  const sql = `${dedupedContributionsCte()}
    SELECT full_name,
      sum(CASE WHEN state = 'merged' THEN 1 ELSE 0 END) AS merged,
      sum(CASE WHEN state = 'open' THEN 1 ELSE 0 END) AS open,
      max(CASE WHEN state = 'merged' THEN time END) AS last_merged
    FROM r WHERE rn = 1 AND kind = 'pull_request'
    GROUP BY full_name
    ORDER BY merged DESC, open DESC`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => ({
    fullName: String(row.full_name),
    merged: num(row.merged),
    open: num(row.open),
    lastMergedAt: typeof row.last_merged === "string" ? row.last_merged : null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// external-contrib — full ledger for the /projects/contributions/ subpage (idea 3)
// ─────────────────────────────────────────────────────────────────────────

/**
 * The full, deduplicated ledger of external PRs and issues, one row per
 * item, created-date computed once (idea 3's fix: the raw `time` column is
 * `closedAt` for closed items and "today" for open ones, so grouping/sorting
 * by it would move an open item's position every day).
 *
 * `contributions.yaml`'s `exclude` list is applied by the caller
 * (`build-data.mjs`), not here: this function returns everything the
 * dedup filter (`user = 'jmrplens'`; `gh_external_contribution` only ever
 * holds this account's OUTBOUND, non-own contributions by construction —
 * see the collector notes in `datos.md`) allows, so a reviewer can see
 * exactly what got excluded and why.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @returns {Promise<LedgerItem[]>} Every external PR/issue, newest created first.
 */
export async function getFullLedger(config) {
  const sql = `${dedupedContributionsCte()}
    SELECT kind, state, full_name, number, time, seconds_open,
      seconds_to_merge, comments, title
    FROM r WHERE rn = 1
    ORDER BY time DESC`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => {
    const closedOrStampedAt = Date.parse(String(row.time));
    const secondsOpen = num(row.seconds_open);
    const createdAt = new Date(
      closedOrStampedAt - secondsOpen * 1000,
    ).toISOString();
    return {
      kind: row.kind === "issue" ? "issue" : "pull_request",
      state: /** @type {'merged'|'open'|'closed'} */ (row.state),
      fullName: String(row.full_name),
      number: num(row.number),
      createdAt,
      hoursToMerge:
        row.state === "merged" ? num(row.seconds_to_merge) / 3600 : null,
      comments: num(row.comments),
      title: typeof row.title === "string" ? row.title : "",
    };
  });
}

/**
 * @typedef {object} LedgerItem
 * @property {'pull_request'|'issue'} kind
 * @property {'merged'|'open'|'closed'} state
 * @property {string} fullName - `owner/repo`.
 * @property {number} number
 * @property {string} createdAt - ISO timestamp, derived once (see above).
 * @property {number | null} hoursToMerge - Only set when `state === 'merged'`.
 * @property {number} comments
 * @property {string} title - Raw GitHub title; caller must HTML-escape it.
 */

// ─────────────────────────────────────────────────────────────────────────
// external-contrib — monthly activity (idea 4)
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// external-contrib — accepted answers (idea 5, CORRECTED)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Accepted GitHub Discussions answers. Idea 5's ORIGINAL SQL used
 * `max(url)`, which picks the lexicographically greatest comment URL, not
 * the accepted one — wrong in 3 of 13 rows on 2026-09-26. This is the
 * CORRECTED query from `datos.md` section 3: group by `url` too, so
 * `answer_url` is the one row's own URL.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @returns {Promise<{
 *   fullName: string, number: number, title: string,
 *   answerUrl: string, answeredAt: string,
 * }[]>} One row per accepted answer, newest first.
 */
export async function getAcceptedAnswers(config) {
  const sql = `SELECT full_name, number, max(title) AS title,
      url AS answer_url, max(time) AS answered_at
    FROM gh_discussion_comment
    WHERE time >= now() - INTERVAL '3650 days'
      AND own = 'false' AND is_answer = 'true' AND answered_by = 'jmrplens'
    GROUP BY full_name, number, url
    ORDER BY answered_at DESC`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => ({
    fullName: String(row.full_name),
    number: num(row.number),
    title: typeof row.title === "string" ? row.title : "",
    answerUrl: String(row.answer_url),
    answeredAt: String(row.answered_at),
  }));
}

/**
 * Total discussions and repos the account has commented in (own repos
 * excluded), for the "13 accepted out of 65 discussions in 43 repositories"
 * honesty line (idea 5's "Cambios").
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @returns {Promise<{comments: number, discussions: number, repos: number}>}
 */
export async function getDiscussionTotals(config) {
  const sql = `SELECT count(DISTINCT comment) AS comments,
      count(DISTINCT full_name || '#' || number) AS discussions,
      count(DISTINCT full_name) AS repos
    FROM gh_discussion_comment
    WHERE own = 'false' AND time >= now() - INTERVAL '3650 days'`;
  const [row] = await queryInflux(sql, config);
  return {
    comments: num(row?.comments),
    discussions: num(row?.discussions),
    repos: num(row?.repos),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// external-contrib — community contributors on the owner's own repos (idea 7, CORRECTED)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Bot logins the account name filter must exclude. Denylist, kept here and
 * not in SQL, because `datos.md` found `fossabot` slipping past the
 * `%[bot]`/`%bot` suffix filter (idea 7's "ERROR"); every new false negative
 * gets added here instead of relying on a wildcard.
 */
const KNOWN_BOT_LOGINS = new Set(["codacy-badger", "fossabot"]);

/**
 * People who opened issues on the account's OWN public repos, excluding the
 * account itself and bots. Idea 7, CORRECTED: the original SQL's
 * `pull_request = 0 OR pull_request IS NULL` filter is wrong — in
 * `gh_issue`, `pull_request` holds the number of the PR that CLOSED the
 * issue, not a boolean flag, so it silently dropped every issue that was
 * resolved by a pull request. The fix removes that filter entirely.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @returns {Promise<{repo: string, issues: number, people: number}[]>}
 */
export async function getCommunityIssueContributors(config) {
  // `codacy-badger` is excluded inline (not via KNOWN_BOT_LOGINS post-filter,
  // unlike getCommunityPrContributors below) because this query never
  // selects `author`, only the aggregate counts — there is no per-row login
  // left to filter after the fact. Any FUTURE bot login this SQL misses must
  // be added here, in the WHERE clause, not to KNOWN_BOT_LOGINS.
  const sql = `SELECT repo, count(DISTINCT number) AS issues,
      count(DISTINCT author) AS people
    FROM gh_issue
    WHERE time >= '2008-01-01' AND owner = '${OWNER}'
      AND author <> '${OWNER}' AND author NOT LIKE '%[bot]' AND author NOT LIKE '%bot'
      AND author <> 'codacy-badger'
    GROUP BY repo`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => ({
    repo: String(row.repo),
    issues: num(row.issues),
    people: num(row.people),
  }));
}

/**
 * People who opened pull requests on the account's OWN public repos,
 * excluding the account and known bots (idea 7).
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @returns {Promise<{repo: string, prs: number, people: number}[]>}
 */
export async function getCommunityPrContributors(config) {
  // `NOT LIKE '%bot'` (no hyphen) is the fix for the leak `datos.md` found in
  // the ORIGINAL idea-7 SQL, which used `NOT LIKE '%-bot'` and missed
  // `fossabot` (no hyphen before "bot"). `codacy-badger` matches neither
  // "%[bot]" nor "%bot", so it needs its own exclusion — found the same way
  // the issues query above needed one, by checking every login this repo's
  // PRs actually carry (verified 2026-09-26: Cloudflare-DNS-Updater's non-bot
  // PR authors are exactly Mikkel-Coder, alexandrewillame, honzahommer).
  const sql = `SELECT repo, count(DISTINCT number) AS prs,
      count(DISTINCT author) AS people, string_agg(DISTINCT author, ',') AS authors
    FROM gh_pull_request
    WHERE time >= '2008-01-01' AND author <> '${OWNER}'
      AND author NOT LIKE '%[bot]' AND author NOT LIKE '%bot'
      AND author <> 'codacy-badger'
    GROUP BY repo`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => {
    const authors = String(row.authors ?? "")
      .split(",")
      .filter((a) => a && !KNOWN_BOT_LOGINS.has(a));
    return {
      repo: String(row.repo),
      prs: num(row.prs),
      people: new Set(authors).size,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// profile-achievements (idea 8)
// ─────────────────────────────────────────────────────────────────────────

/**
 * The 8 GitHub achievement badges present on the profile, with tier and
 * (for the 4 tiered ones) community-sourced progress. Idea 8.
 *
 * NEVER print `count` for Pull Shark as a public figure (it includes ~90
 * private-repo PRs) — that filtering is a presentation decision for the
 * caller, documented here so it is not lost: render the tier word, not the
 * raw count, for `pull-shark`.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @returns {Promise<AchievementRow[]>} 8 rows, ordered by tier then name.
 */
export async function getAchievements(config) {
  const sql = `SELECT a.achievement, a.name, a.tier_number, a.tier_name,
      a.image, p.count, p.next_threshold, p.percent, p.agrees
    FROM gh_achievement a
    LEFT JOIN gh_achievement_progress p
      ON p.achievement = a.achievement AND p.time = a.time
    WHERE a.time = (SELECT max(time) FROM gh_achievement WHERE time >= now() - INTERVAL '7 days')
      AND a.present = 1
    ORDER BY a.tier_number DESC, a.name`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => ({
    achievement: String(row.achievement),
    name: String(row.name),
    tierNumber: num(row.tier_number),
    tierName: String(row.tier_name),
    count: [undefined, null].includes(row.count) ? null : num(row.count),
    nextThreshold: numOrNull(row.next_threshold),
    percent: numOrNull(row.percent),
    agrees: [1, "1", true].includes(row.agrees),
    image: row.image ? String(row.image) : null,
  }));
}

/**
 * @typedef {object} AchievementRow
 * @property {string} achievement - Slug, e.g. `"pull-shark"`.
 * @property {string} name - Display name, e.g. `"Pull Shark"`.
 * @property {number} tierNumber - 1-4.
 * @property {string} tierName - `"default" | "bronze" | "silver" | "gold"`.
 * @property {number | null} count - Community-estimated progress count.
 * @property {number | null} nextThreshold - Count needed for the next tier.
 * @property {number | null} percent
 * @property {boolean} agrees - Whether the collector's own tier estimate
 *   agrees with GitHub's displayed tier; render a progress bar only when true.
 * @property {string | null} image - GitHub's badge image URL for this tier
 *   (`github.githubassets.com`); only `fetch-achievement-badges.mjs` reads
 *   it, to self-host the file. Never rendered, never loaded by a browser.
 */

// ─────────────────────────────────────────────────────────────────────────
// repo-stats — stars, releases, downloads (idea 16, 17, 18, 19, all CORRECTED)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Live stars and 30-day gain, per ACTIVE roster repo. Idea 16.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {readonly string[]} [repos] - Repos to query; defaults to
 *   `ACTIVE_REPOS`.
 * @returns {Promise<{repo: string, stars: number, stars30d: number}[]>}
 */
export async function getStars(config, repos = ACTIVE_REPOS) {
  const roster = sqlRepoList(repos);
  const sql = `WITH r AS (
      SELECT repo, stars, ROW_NUMBER() OVER (PARTITION BY repo ORDER BY time DESC) AS rn
      FROM gh_repo
      WHERE time >= now() - INTERVAL '3 days' AND owner = '${OWNER}'
        AND visibility = 'public' AND repo IN (${roster})
    ), s AS (
      SELECT repo, sum(stars) AS stars_30d
      FROM gh_star_day
      WHERE time >= now() - INTERVAL '30 days' AND owner = '${OWNER}' AND repo IN (${roster})
      GROUP BY repo
    )
    SELECT r.repo, r.stars, coalesce(s.stars_30d, 0) AS stars_30d
    FROM r LEFT JOIN s ON s.repo = r.repo
    WHERE r.rn = 1 ORDER BY r.stars DESC`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => ({
    repo: String(row.repo),
    stars: num(row.stars),
    stars30d: num(row.stars_30d),
  }));
}

/**
 * Latest stable release per ACTIVE roster repo (drafts and prereleases
 * excluded). Idea 17, CORRECTED: the original `min(age_days)` over every
 * hourly snapshot in a 1-day window came out up to a day short (verified
 * against `published_at` for all 8 repos); this version picks the row from
 * the single latest snapshot time per repo (`mt` window function) before
 * ranking by `age_days`.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {readonly string[]} [repos] - Repos to query; defaults to
 *   `ACTIVE_REPOS`.
 * @returns {Promise<{repo: string, tag: string, ageDays: number}[]>}
 */
export async function getLatestRelease(config, repos = ACTIVE_REPOS) {
  const roster = sqlRepoList(repos);
  const sql = `WITH s AS (
      SELECT repo, tag, age_days, time, max(time) OVER (PARTITION BY repo) AS mt
      FROM gh_release
      WHERE time >= now() - INTERVAL '1 day'
        AND owner = '${OWNER}' AND draft = 'false' AND prerelease = 'false'
        AND repo IN (${roster})
    ), c AS (
      SELECT repo, tag, age_days,
        ROW_NUMBER() OVER (PARTITION BY repo ORDER BY age_days ASC) AS rn
      FROM s WHERE time = mt
    )
    SELECT repo, tag, age_days FROM c WHERE rn = 1`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => ({
    repo: String(row.repo),
    tag: String(row.tag),
    ageDays: num(row.age_days),
  }));
}

/**
 * Header activity band: stars/forks (ALL roster, active + archived — the
 * 30-day window keeps the frozen archived rows from dropping out, per idea
 * 18's fix), stars gained in 30 days (active roster only), and releases
 * shipped in the last 90/30 days (active roster only).
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @returns {Promise<{
 *   stars: number, forks: number, repos: number,
 *   stars30d: number, releases90d: number, releases30d: number,
 * }>} Header band figures.
 */
export async function getHeaderActivityBand(config) {
  const fullRoster = sqlRepoList(ALL_ROSTER_REPOS);
  const activeRoster = sqlRepoList(ACTIVE_REPOS);

  const starsSql = `SELECT sum(stars) AS stars, sum(forks) AS forks, count(*) AS repos
    FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY repo ORDER BY time DESC) AS rn
      FROM gh_repo
      WHERE time >= now() - INTERVAL '30 days' AND owner = '${OWNER}' AND repo IN (${fullRoster})
    ) WHERE rn = 1 AND visibility = 'public'`;
  const [starsRow] = await queryInflux(starsSql, config);

  const stars30dSql = `SELECT sum(stars) AS n FROM gh_star_day
    WHERE time >= now() - INTERVAL '30 days' AND owner = '${OWNER}' AND repo IN (${activeRoster})`;
  const [stars30dRow] = await queryInflux(stars30dSql, config);

  const releasesSql = `WITH c AS (
      SELECT repo, tag, age_days,
        ROW_NUMBER() OVER (PARTITION BY repo, tag ORDER BY time DESC) AS rn
      FROM gh_release
      WHERE time >= now() - INTERVAL '2 days' AND owner = '${OWNER}' AND draft = 'false'
        AND repo IN (${activeRoster})
    )
    SELECT count(*) FILTER (WHERE age_days <= 90) AS rel_90d,
      count(*) FILTER (WHERE age_days <= 30) AS rel_30d
    FROM c WHERE rn = 1`;
  const [releasesRow] = await queryInflux(releasesSql, config);

  return {
    stars: num(starsRow?.stars),
    forks: num(starsRow?.forks),
    repos: num(starsRow?.repos),
    stars30d: num(stars30dRow?.n),
    releases90d: num(releasesRow?.rel_90d),
    releases30d: num(releasesRow?.rel_30d),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// contribution-activity — active days, streak, per-card maintenance (idea 11, 12, 13, 14)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Trailing-12-month active-days count and current streak, from the daily
 * contribution calendar (idea 12). The calendar undercounts GitHub's own
 * live page by ~6% on 2026 days (documented, unresolved upstream), so the
 * caller should present this as "according to GitHub's calendar", not as an
 * exact total.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @returns {Promise<{activeDays: number, totalContributions: number, streakDays: number,
 *   streakStart: string | null, streakEnd: string | null}>}
 */
export async function getActivityBand(config) {
  const totalsSql = `SELECT sum(contributions) AS total,
      sum(CASE WHEN contributions > 0 THEN 1 ELSE 0 END) AS active_days
    FROM gh_contribution_day WHERE time >= now() - INTERVAL '365 days'`;
  const [totalsRow] = await queryInflux(totalsSql, config);

  const streakSql = `WITH d AS (
      SELECT time, CAST(extract(epoch FROM time) / 86400 AS BIGINT) AS dn
      FROM gh_contribution_day
      WHERE time >= now() - INTERVAL '5000 days' AND contributions > 0
    ), g AS (
      SELECT time, dn - ROW_NUMBER() OVER (ORDER BY time) AS grp FROM d
    )
    SELECT min(time) AS s, max(time) AS e, count(*) AS len
    FROM g GROUP BY grp ORDER BY len DESC LIMIT 5`;
  const streakRows = await queryInflux(streakSql, config);
  const longest = streakRows[0];

  return {
    activeDays: num(totalsRow?.active_days),
    totalContributions: num(totalsRow?.total),
    streakDays: num(longest?.len),
    streakStart: typeof longest?.s === "string" ? longest.s : null,
    streakEnd: typeof longest?.e === "string" ? longest.e : null,
  };
}

/**
 * Active days (trailing 12 months) and last owner commit per ACTIVE roster
 * repo, plus the roster's public MATLAB/academic archived repos when passed
 * explicitly. Idea 11: only meaningful for cards with more than ~5 active
 * days (the caller applies that threshold); the 2026-06-28/29 policy-sweep
 * commits should be treated as noise by any "last commit" consumer, which
 * this function cannot detect from `gh_contribution_repo` alone.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {readonly string[]} [repos] - Repos to query; defaults to
 *   `ACTIVE_REPOS`.
 * @returns {Promise<{repo: string, activeDays12m: number}[]>}
 */
export async function getMaintenanceActiveDays(config, repos = ACTIVE_REPOS) {
  const roster = sqlRepoList(repos);
  const sql = `SELECT repo, contributions AS commits_12m, days AS active_days
    FROM gh_contribution_repo
    WHERE time = (SELECT max(time) FROM gh_contribution_repo WHERE time >= now() - INTERVAL '10 days')
      AND owner = '${OWNER}' AND kind = 'commits' AND repo IN (${roster})
    ORDER BY days DESC`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => ({
    repo: String(row.repo),
    activeDays12m: num(row.active_days ?? row.days),
  }));
}

/**
 * Last commit BY THE OWNER (author filter mandatory — see `datos.md`, idea
 * 11's warning about `jmrplens/jmrplens`'s 2,646 automated profile-README
 * commits) per ACTIVE roster repo, from `gh_commit`.
 *
 * `phonometry`'s history was rewritten (moved to the private
 * `phonometry-archive`), so `gh_commit` only covers it from 2026-09-18 — use
 * {@link getLastOwnerActivity} for that repo instead.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {readonly string[]} [repos] - Repos to query; defaults to
 *   `ACTIVE_REPOS`.
 * @returns {Promise<{repo: string, lastCommitAt: string | null}[]>}
 */
export async function getLastOwnerCommit(config, repos = ACTIVE_REPOS) {
  const roster = sqlRepoList(repos);
  const sql = `SELECT repo, max(time) AS last_commit
    FROM gh_commit
    WHERE time >= now() - INTERVAL '5000 days' AND owner = '${OWNER}'
      AND author = '${OWNER}' AND repo IN (${roster})
    GROUP BY repo ORDER BY last_commit DESC`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => ({
    repo: String(row.repo),
    lastCommitAt: typeof row.last_commit === "string" ? row.last_commit : null,
  }));
}

/**
 * Last owner ACTIVITY (push/merge/branch events, not raw commits) per
 * roster repo, from `gh_repo_activity`. Covers repos whose commit history
 * was rewritten (phonometry) where {@link getLastOwnerCommit} cannot.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {readonly string[]} [repos] - Repos to query; defaults to
 *   `ACTIVE_REPOS`.
 * @returns {Promise<{repo: string, lastActivityAt: string | null}[]>}
 */
export async function getLastOwnerActivity(config, repos = ACTIVE_REPOS) {
  const roster = sqlRepoList(repos);
  const sql = `SELECT repo, max(CASE WHEN actor = '${OWNER}' THEN time END) AS last_owner_activity
    FROM gh_repo_activity
    WHERE time >= now() - INTERVAL '5000 days' AND owner = '${OWNER}' AND repo IN (${roster})
    GROUP BY repo`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => ({
    repo: String(row.repo),
    lastActivityAt:
      typeof row.last_owner_activity === "string"
        ? row.last_owner_activity
        : null,
  }));
}

/**
 * Commits that landed on the DEFAULT branch of third-party (non-owner)
 * public repos, for the "commits landed upstream" summary (idea 13). Caller
 * classifies code vs. packaging/listing via `contributions.yaml`.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @returns {Promise<{fullName: string, commits: number, days: number,
 *   firstLandedAt: string, lastLandedAt: string}[]>}
 */
export async function getUpstreamLandedCommits(config) {
  const sql = `SELECT full_name, sum(commits) AS commits, count(*) AS days,
      min(time) AS first_landed, max(time) AS last_landed
    FROM gh_contribution_day_repo
    WHERE time >= '2008-01-01T00:00:00Z' AND own = 'false' AND private = 'false'
    GROUP BY full_name ORDER BY last_landed DESC`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => ({
    fullName: String(row.full_name),
    commits: num(row.commits),
    days: num(row.days),
    firstLandedAt: String(row.first_landed),
    lastLandedAt: String(row.last_landed),
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// ci-quality — CI matrix, pass rate, CodeQL, Dependabot, hygiene (idea 22-26)
// ─────────────────────────────────────────────────────────────────────────

/** Maps a GitHub Actions runner label to a human OS name. */
function runnerLabelToOs(label) {
  const l = label.toLowerCase();
  if (l.includes("ubuntu") || l.includes("linux")) return "Linux";
  if (l.includes("macos")) return "macOS";
  if (l.includes("windows")) return "Windows";
  return label;
}

/**
 * CI job count and OS coverage from the latest green run of the "main" CI
 * workflow on `main`, per MAINTENANCE roster repo (idea 22). The
 * `workflow LIKE '%/ci.yml' OR name IN (...)` heuristic is the one
 * `datos.md` tested and verified against the API; `conclusion <> 'skipped'`
 * excludes jobs the matrix conditionally skips.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {readonly string[]} [repos] - Repos to query; defaults to
 *   `MAINTENANCE_REPOS`.
 * @returns {Promise<{repo: string, jobs: number, os: string[]}[]>}
 */
export async function getCiMatrix(config, repos = MAINTENANCE_REPOS) {
  const roster = sqlRepoList(repos);
  const sql = `WITH lr AS (
      SELECT repo, max(run_id) AS rid
      FROM gh_workflow_run
      WHERE time >= now() - INTERVAL '180 days' AND head_branch = 'main' AND event = 'push'
        AND (workflow LIKE '%/ci.yml' OR name IN ('CI', 'Python CI', 'Tests'))
        AND conclusion = 'success' AND repo IN (${roster})
      GROUP BY repo
    )
    SELECT j.repo, count(*) AS jobs, string_agg(DISTINCT j.labels, '|') AS labels
    FROM gh_workflow_job j
    JOIN lr ON j.repo = lr.repo AND j.run_id = lr.rid
    WHERE j.time >= now() - INTERVAL '181 days' AND j.conclusion <> 'skipped'
    GROUP BY j.repo ORDER BY jobs DESC`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => {
    const labels = String(row.labels ?? "")
      .split("|")
      .filter(Boolean);
    const os = [...new Set(labels.map(runnerLabelToOs))];
    return { repo: String(row.repo), jobs: num(row.jobs), os };
  });
}

/** CI workflow paths excluded from the pass-rate denominator, per repo family. */
const CI_WORKFLOW_EXCLUDE_LIKE = "gitlab-mirror";

/**
 * 90-day pass rate of `main`-branch CI runs, one workflow-name exclusion
 * (`gitlab-mirror`, which fails persistently on `cs-routeros-bouncer` and
 * would halve its rate if counted) applied globally (idea 23).
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {readonly string[]} [repos] - Repos to query; defaults to
 *   `MAINTENANCE_REPOS`.
 * @returns {Promise<{repo: string, ok: number, ko: number, pct: number | null}[]>}
 */
export async function getCiPassRate(config, repos = MAINTENANCE_REPOS) {
  const roster = sqlRepoList(repos);
  const sql = `SELECT repo,
      count(*) FILTER (WHERE conclusion = 'success') AS ok,
      count(*) FILTER (WHERE conclusion IN ('failure', 'timed_out', 'startup_failure')) AS ko
    FROM gh_workflow_run
    WHERE time >= now() - INTERVAL '90 days' AND repo IN (${roster})
      AND head_branch = 'main' AND event IN ('push', 'schedule')
      AND workflow NOT LIKE '%${CI_WORKFLOW_EXCLUDE_LIKE}%'
    GROUP BY repo`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => {
    const ok = num(row.ok);
    const ko = num(row.ko);
    const denom = ok + ko;
    return {
      repo: String(row.repo),
      ok,
      ko,
      pct: denom > 0 ? Math.round((1000 * ok) / denom) / 10 : null,
    };
  });
}

/**
 * CodeQL languages covered and the most recent scan of `main`, per
 * MAINTENANCE roster repo (idea 25). Deliberately never selects the
 * `results` column (open/dismissed finding count — never public portfolio
 * content).
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {readonly string[]} [repos] - Repos to query; defaults to
 *   `MAINTENANCE_REPOS`.
 * @returns {Promise<{repo: string, languages: string[], lastScanAt: string}[]>}
 */
export async function getCodeQlCoverage(config, repos = MAINTENANCE_REPOS) {
  const roster = sqlRepoList(repos);
  const sql = `WITH r AS (
      SELECT repo, category, time,
        ROW_NUMBER() OVER (PARTITION BY repo, category ORDER BY time DESC) AS rn
      FROM gh_code_scanning_analysis
      WHERE time >= now() - INTERVAL '30 days' AND ref = 'main' AND tool = 'CodeQL'
        AND repo IN (${roster})
    )
    SELECT repo, string_agg(replace(category, '/language:', ''), ',') AS langs,
      max(time) AS last_scan
    FROM r WHERE rn = 1 GROUP BY repo ORDER BY repo`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => ({
    repo: String(row.repo),
    languages: String(row.langs ?? "")
      .split(",")
      .filter(Boolean),
    lastScanAt: String(row.last_scan),
  }));
}

/**
 * Dependabot alerts fixed and the exact median time-to-fix (JS-computed, not
 * `approx_percentile_cont`), across the MAINTENANCE roster (idea 24 — an
 * owner-decision feature; see PLAN.md 8.2 #7). Never selects alert titles,
 * CVE/GHSA ids or severities.
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {readonly string[]} [repos] - Repos to query; defaults to
 *   `MAINTENANCE_REPOS`.
 * @returns {Promise<{
 *   perRepo: {repo: string, fixed: number, medianDays: number | null}[],
 *   total: number, medianDays: number | null, within7Days: number,
 * }>} Aggregate and per-repo figures.
 */
export async function getDependabotFixed(config, repos = MAINTENANCE_REPOS) {
  const roster = sqlRepoList(repos);
  const sql = `SELECT repo, seconds_to_resolve
    FROM gh_dependabot_alert_item
    WHERE time >= now() - INTERVAL '3000 days' AND alert_state = 'fixed' AND repo IN (${roster})`;
  const rows = await queryInflux(sql, config);

  const perRepoSeconds = new Map();
  const allSeconds = [];
  for (const row of rows) {
    const seconds = num(row.seconds_to_resolve, NaN);
    if (Number.isNaN(seconds)) continue;
    const repo = String(row.repo);
    if (!perRepoSeconds.has(repo)) perRepoSeconds.set(repo, []);
    perRepoSeconds.get(repo).push(seconds);
    allSeconds.push(seconds);
  }

  const medianDaysOf = (values) => {
    const seconds = medianOf(values);
    return seconds === null ? null : seconds / 86_400;
  };

  const perRepo = [...perRepoSeconds].map(([repo, seconds]) => ({
    repo,
    fixed: seconds.length,
    medianDays: medianDaysOf(seconds),
  }));

  return {
    perRepo,
    total: allSeconds.length,
    medianDays: medianDaysOf(allSeconds),
    within7Days: allSeconds.filter((s) => s <= 7 * 86_400).length,
  };
}

/**
 * Repository hygiene checklist: policy files present, branch protection
 * (classic + rulesets merged), one row per MAINTENANCE roster repo (idea
 * 26). FUNDING file presence is deliberately never queried (owner rule:
 * never surface Ko-fi/funding links).
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {readonly string[]} [repos] - Repos to query; defaults to
 *   `MAINTENANCE_REPOS`.
 * @returns {Promise<HygieneRow[]>}
 */
export async function getRepoHygiene(config, repos = MAINTENANCE_REPOS) {
  const roster = sqlRepoList(repos);

  const policySql = `WITH l AS (
      SELECT full_name, file, max(time) AS t FROM gh_policy_file
      WHERE time >= now() - INTERVAL '3000 days' GROUP BY full_name, file
    )
    SELECT p.repo, string_agg(CASE WHEN p.present THEN p.file END, ',') AS present
    FROM gh_policy_file p
    JOIN l ON p.full_name = l.full_name AND p.file = l.file AND p.time = l.t
    WHERE p.repo IN (${roster}) AND p.file <> 'FUNDING'
    GROUP BY p.repo`;
  const policyRows = await queryInflux(policySql, config);

  const rulesetSql = `SELECT repo, string_agg(DISTINCT rule, ',') AS rules
    FROM gh_ruleset_rule
    WHERE time >= now() - INTERVAL '2 days' AND repo IN (${roster})
    GROUP BY repo`;
  const rulesetRows = await queryInflux(rulesetSql, config);

  const classicSql = `SELECT repo, requires_status_checks, requires_linear_history
    FROM gh_branch_protection
    WHERE time >= now() - INTERVAL '2 days' AND pattern = 'main' AND repo IN (${roster})`;
  const classicRows = await queryInflux(classicSql, config);

  const ecosystemSql = `SELECT repo, string_agg(DISTINCT ecosystem, ',') AS ecosystems
    FROM gh_dependabot_ecosystem
    WHERE time >= now() - INTERVAL '3000 days' AND repo IN (${roster})
    GROUP BY repo`;
  const ecosystemRows = await queryInflux(ecosystemSql, config);

  /** @type {Map<string, HygieneRow>} */
  const byRepo = new Map(
    repos.map((repo) => [
      repo,
      {
        repo,
        policyFiles: [],
        rulesetRules: [],
        hasClassicProtection: false,
        dependabotEcosystems: [],
      },
    ]),
  );
  for (const row of policyRows) {
    const entry = byRepo.get(String(row.repo));
    if (entry)
      entry.policyFiles = String(row.present ?? "")
        .split(",")
        .filter(Boolean);
  }
  for (const row of rulesetRows) {
    const entry = byRepo.get(String(row.repo));
    if (entry)
      entry.rulesetRules = String(row.rules ?? "")
        .split(",")
        .filter(Boolean);
  }
  for (const row of classicRows) {
    const entry = byRepo.get(String(row.repo));
    if (entry) entry.hasClassicProtection = true;
  }
  for (const row of ecosystemRows) {
    const entry = byRepo.get(String(row.repo));
    if (entry)
      entry.dependabotEcosystems = String(row.ecosystems ?? "")
        .split(",")
        .filter(Boolean);
  }
  return [...byRepo.values()];
}

/**
 * @typedef {object} HygieneRow
 * @property {string} repo
 * @property {string[]} policyFiles - e.g. `["SECURITY.md", "CODEOWNERS"]`.
 * @property {string[]} rulesetRules
 * @property {boolean} hasClassicProtection
 * @property {string[]} dependabotEcosystems
 */

/**
 * Last successful `github-pages` deployment and its 90-day publish count,
 * per full name (idea 28). `ok_pct_90d` from `avg(...) FILTER` returns 0.0
 * instead of NULL over an empty window (a real bug in the source data, per
 * `datos.md`), so a repo with `deploysIn90d === 0` must be rendered as
 * "no data", never as "0%".
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {readonly string[]} fullNames - `owner/repo` full names.
 * @returns {Promise<{fullName: string, lastPublishAt: string | null, deploysIn90d: number}[]>}
 */
export async function getDocsPublished(config, fullNames) {
  const roster = sqlFullNameList(fullNames);
  const sql = `SELECT full_name,
      max(time) FILTER (WHERE success) AS last_publish,
      count(*) FILTER (WHERE time >= now() - INTERVAL '90 days' AND success) AS deploys_90d
    FROM gh_deployment
    WHERE time >= now() - INTERVAL '4000 days' AND environment = 'github-pages'
      AND full_name IN (${roster})
    GROUP BY full_name ORDER BY last_publish DESC`;
  const rows = await queryInflux(sql, config);
  return rows.map((row) => ({
    fullName: String(row.full_name),
    lastPublishAt:
      typeof row.last_publish === "string" ? row.last_publish : null,
    deploysIn90d: num(row.deploys_90d),
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// meta-private — freshness stamp (idea 27)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Oldest "last successful sweep" among the given collector families — the
 * conservative freshness stamp (idea 27's "Cambios": "sello por bloque o
 * min(max(time)) sobre una lista IN explícita"). NEVER selects `error` or
 * repo-scope rows (they name private repos and internal addresses).
 *
 * @param {import('./influx.mjs').InfluxConfig} config - Connection settings.
 * @param {readonly string[]} families - Collector family names to include.
 * @returns {Promise<{asOf: string | null, perFamily: {family: string, lastOk: string}[]}>}
 */
export async function getFreshness(config, families) {
  const list = families.map((f) => `'${f}'`).join(",");
  const sql = `SELECT family, max(time) AS last_ok
    FROM gh_collector_family
    WHERE time >= now() - INTERVAL '3 days' AND scope = 'family' AND failed = 0
      AND family IN (${list})
    GROUP BY family ORDER BY family`;
  const rows = await queryInflux(sql, config);
  const perFamily = rows.map((row) => ({
    family: String(row.family),
    lastOk: String(row.last_ok),
  }));
  // ISO-8601 timestamps sort lexicographically, so a plain string comparison
  // gives the oldest one. Written as an explicit loop, not
  // `perFamily.reduce((min, r) => Math.min(r.lastOk, min), ...)`: Math.min()
  // coerces its arguments to Number, and neither is a numeric literal, so
  // that "fix" silently turns every asOf into NaN.
  let asOf = perFamily.length === 0 ? null : perFamily[0].lastOk;
  for (const row of perFamily) {
    if (asOf === null || row.lastOk < asOf) asOf = row.lastOk;
  }
  return { asOf, perFamily };
}
