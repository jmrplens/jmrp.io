/**
 * The DISPLAY PROJECTION of the build-time contributions dataset
 * (`src/data/ghc/projects-contributions.json`) and the small state file that
 * remembers which projection the live site was built from. Used by
 * `scripts/ghc/rebuild-if-changed.mjs` (the daily scheduled rebuild) and by
 * `scripts/deploy-live.mjs` (so a manual deploy records its dataset too).
 *
 * ── Why a projection ──────────────────────────────────────────────────
 * The dataset carries far more than /projects/contributions/, the /projects
 * build-time blocks and the home line render, and much of it moves every
 * day without changing a single visible word. Hashing the whole file would
 * rebuild (and purge Cloudflare, and resubmit URLs to IndexNow) every day.
 * The projection keeps ONLY what should trigger a rebuild when it changes:
 *
 * - `ledger`: every code/docs PR or MR (`ledgerByYear`, flattened and
 *   sorted by platform, repository and number): project group, platform,
 *   kind, repository, number, state, title, whether it is redacted, and the
 *   diff size a pull/merge request prints (lines added, removed, files).
 * - `listingsByOwnProject` and `issuesByProject`: whole (they are counts).
 * - `acceptedAnswers`: repository and number, in the displayed order.
 * - `achievements`: platform, id, name, tier name and number, and the
 *   progress `count` / `nextThreshold` ONLY when the badge shelf prints
 *   them (GitHub badge, not Galaxy Brain, `agrees`, a next tier exists and
 *   the count is known), mirroring `AchievementShelf.astro`.
 * - `highlights`: the curated entries (repository, number, kind, platform,
 *   both `why` texts, the summed diff size and the language they print).
 * - `contributedTo`: membership and order, with the star count rounded
 *   EXACTLY as `formatCompactStars` prints it (38012 and 38044 are both
 *   "38k"), the main language, and the month of the latest merge (the strip
 *   shows month and year).
 * - `cardRows`: which live rows each /projects/ card's markdown twin prints
 *   (`cardFacts`: stars above 0, a 30-day gain above 0, a stable release),
 *   as booleans, never the figures themselves: the twin decides those rows
 *   at build time, so a flip has to rebuild it.
 * - `summary`: the figures of the subpage intro and tiles: PRs merged, open
 *   and closed, issues open and closed, repositories, code/docs merged and
 *   open, listing merged, accepted answers.
 *
 * Deliberately EXCLUDED, because they are volatile or stale-tolerant:
 * `generatedAt`, `asOf`, every `comments` count, `hoursToMerge` and the
 * medians built from it, `createdAt`, `discussionTotals` (it grows with
 * every thread commented on), `maintenance` (active days, CI pass rate,
 * CodeQL, hygiene, docs deploys), `communityContributors`,
 * `upstreamLandedCommits`, `dependabot`, the raw `gitlab` part and exact
 * star counts. They are refreshed by whatever rebuild happens next, and at
 * the latest by the forced weekly one.
 *
 * ── State file ────────────────────────────────────────────────────────
 * `{ projectionHash, sections, builtAt }` at {@link DEFAULT_STATE_PATH}
 * (override with `GHC_REBUILD_STATE`). `sections` holds one hash per
 * projection key, so a dry run can say WHICH part changed without storing
 * the dataset itself.
 *
 * @module
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Default location of the rebuild state file on the production host. */
export const DEFAULT_STATE_PATH = "/var/lib/jmrp.io/ghc/rebuild-state.json";

/** Default age, in days, after which a rebuild is forced. */
export const DEFAULT_MAX_AGE_DAYS = 7;

/** Dataset path relative to the repository root (mirrors `build-data.mjs`). */
const DATASET_RELATIVE_PATH = "src/data/ghc/projects-contributions.json";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The state file path: `GHC_REBUILD_STATE` when set and non-empty, else
 * {@link DEFAULT_STATE_PATH}.
 *
 * @param {NodeJS.ProcessEnv} [env] - Environment to read.
 * @returns {string} Absolute or cwd-relative path.
 */
export function resolveStatePath(env = process.env) {
  return env.GHC_REBUILD_STATE || DEFAULT_STATE_PATH;
}

/**
 * The forced-rebuild age in days: `GHC_REBUILD_MAX_AGE_DAYS` when it is a
 * positive number, else {@link DEFAULT_MAX_AGE_DAYS}.
 *
 * @param {NodeJS.ProcessEnv} [env] - Environment to read.
 * @returns {number} Days.
 */
export function resolveMaxAgeDays(env = process.env) {
  const parsed = Number(env.GHC_REBUILD_MAX_AGE_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_AGE_DAYS;
}

/**
 * A star count as the site prints it, locale-neutral: the same rounding as
 * `formatCompactStars` in `src/i18n/utils.ts` (exact below 1,000, one
 * decimal of thousands above it, trailing `.0` dropped). The decimal
 * separator is the only locale difference there, so it is irrelevant here.
 *
 * @param {number | null | undefined} value - Star count, or null if unknown.
 * @returns {string | null} E.g. `"708"`, `"5.2k"`, `"38k"`; null if unknown.
 */
export function compactStars(value) {
  if (value === null || value === undefined) return null;
  if (value < 1000) return String(value);
  const rounded = Math.round(value / 100) / 10;
  return `${Number.isSafeInteger(rounded) ? String(rounded) : rounded.toFixed(1)}k`;
}

/**
 * Whether `AchievementShelf.astro` prints a progress count for this badge.
 *
 * @param {{platform?: string, achievement: string, agrees?: boolean,
 *   nextThreshold?: number, count?: number | null}} row - Achievement row.
 * @returns {boolean} True when "count / nextThreshold" is rendered.
 */
function showsProgress(row) {
  return (
    row.platform !== "gitlab" &&
    row.achievement !== "galaxy-brain" &&
    row.agrees === true &&
    (row.nextThreshold ?? 0) > 0 &&
    row.count !== null &&
    row.count !== undefined
  );
}

/**
 * Compares two strings or numbers for a stable sort.
 *
 * @param {string | number} a - Left.
 * @param {string | number} b - Right.
 * @returns {number} Negative, zero or positive.
 */
function compare(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * Flattens `ledgerByYear` into one row per item, sorted so that the order
 * the query returned rows in never matters.
 *
 * @param {Record<string, Record<string, object[]>>} ledgerByYear - Ledger.
 * @returns {object[]} Projected ledger rows.
 */
function projectLedger(ledgerByYear = {}) {
  const rows = [];
  for (const projects of Object.values(ledgerByYear)) {
    for (const [project, items] of Object.entries(projects)) {
      for (const item of items) {
        rows.push({
          project,
          platform: item.platform ?? "github",
          kind: item.kind,
          fullName: item.fullName,
          number: item.number,
          state: item.state,
          title: item.redacted ? null : (item.title ?? null),
          redacted: Boolean(item.redacted),
          size: itemSize(item),
        });
      }
    }
  }
  return rows.toSorted(
    (a, b) =>
      compare(a.platform, b.platform) ||
      compare(a.fullName, b.fullName) ||
      compare(a.number, b.number) ||
      compare(a.kind, b.kind),
  );
}

/**
 * A ledger item's diff size as the page prints it, or null for an issue or
 * an item without one.
 *
 * @param {any} item - A ledger item.
 * @returns {[number | null, number | null, number] | null} Lines added,
 *   removed, and files touched.
 */
function itemSize(item) {
  if (item.kind !== "pull_request" || typeof item.changedFiles !== "number") {
    return null;
  }
  return [item.additions ?? null, item.deletions ?? null, item.changedFiles];
}

/**
 * Keeps only what the site renders from the dataset in a way that should
 * trigger a rebuild. See the module comment for the rule. Pure.
 *
 * @param {any} dataset - Parsed `projects-contributions.json`.
 * @returns {Record<string, unknown>} The display projection.
 */
export function projectDisplay(dataset) {
  const totals = dataset.summary?.contributionTotals ?? {};
  const split = dataset.summary?.codeVsListingSplit ?? {};
  return {
    summary: {
      prMerged: totals.prMerged ?? null,
      prOpen: totals.prOpen ?? null,
      prClosed: totals.prClosed ?? null,
      issuesOpen: totals.issuesOpen ?? null,
      issuesClosed: totals.issuesClosed ?? null,
      repos: totals.repos ?? null,
      codeOrDocsMerged: split.codeOrDocs?.merged ?? null,
      codeOrDocsOpen: split.codeOrDocs?.open ?? null,
      listingMerged: split.listing?.merged ?? null,
      answersCount: dataset.summary?.answersCount ?? null,
    },
    highlights: (dataset.highlights ?? []).map((h) => ({
      repo: h.repo,
      number: h.number,
      kind: h.kind,
      platform: h.platform ?? "github",
      why: h.why ?? null,
      size: h.size ?? null,
      language: h.language ?? null,
    })),
    contributedTo: (dataset.contributedTo ?? []).map((row) => ({
      project: row.project,
      repo: row.repo,
      platform: row.platform,
      stars: compactStars(row.stars),
      language: row.language ?? null,
      lastMergedMonth: row.lastMergedAt ? row.lastMergedAt.slice(0, 7) : null,
    })),
    acceptedAnswers: (dataset.acceptedAnswers ?? []).map((a) => ({
      fullName: a.fullName,
      number: a.number,
    })),
    ledger: projectLedger(dataset.ledgerByYear),
    listingsByOwnProject: dataset.listingsByOwnProject ?? {},
    issuesByProject: dataset.issuesByProject ?? {},
    cardRows: Object.fromEntries(
      Object.entries(dataset.cardFacts ?? {}).map(([repo, facts]) => [
        repo,
        {
          stars: (facts?.stars ?? 0) > 0,
          gain: (facts?.stars30d ?? 0) > 0,
          release: Boolean(facts?.releaseTag),
        },
      ]),
    ),
    achievements: (dataset.achievements ?? []).map((row) => ({
      platform: row.platform ?? "github",
      achievement: row.achievement,
      name: row.name,
      tierName: row.tierName,
      tierNumber: row.tierNumber,
      progress: showsProgress(row)
        ? { count: row.count, nextThreshold: row.nextThreshold }
        : null,
    })),
  };
}

/**
 * JSON with object keys sorted at every depth (array order is kept: it is
 * meaningful wherever the projection keeps an array).
 *
 * @param {unknown} value - Any JSON-serializable value.
 * @returns {string} Canonical JSON.
 */
export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value)
      .toSorted(compare)
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * SHA-256 hex digest of a string.
 *
 * @param {string} text - Input.
 * @returns {string} Hex digest.
 */
function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Hashes a dataset's display projection, whole and per section.
 *
 * @param {any} dataset - Parsed dataset.
 * @returns {{projectionHash: string, sections: Record<string, string>}}
 *   The overall hash and one hash per projection key.
 */
export function hashProjection(dataset) {
  const projection = projectDisplay(dataset);
  /** @type {Record<string, string>} */
  const sections = {};
  for (const key of Object.keys(projection).toSorted(compare)) {
    sections[key] = sha256(stableStringify(projection[key]));
  }
  return { projectionHash: sha256(stableStringify(projection)), sections };
}

/**
 * @typedef {object} RebuildState
 * @property {string} projectionHash Hash of the projection the live build used.
 * @property {Record<string, string>} [sections] Per-section hashes.
 * @property {string} builtAt ISO timestamp of that build.
 * @property {string} [displayChangedAt] When the projection last changed, as
 *   the dataset of that build recorded it.
 */

/**
 * @typedef {object} RebuildDecision
 * @property {boolean} rebuild Whether to rebuild.
 * @property {"no-state" | "changed" | "stale" | "unchanged"} reason Why.
 * @property {string[]} changedSections Projection keys whose hash differs
 *   (empty when unknown or unchanged).
 * @property {number | null} ageDays Age of the recorded build, if known.
 */

/**
 * Decides whether the site must be rebuilt. Pure.
 *
 * @param {object} input - Inputs.
 * @param {RebuildState | null} input.state - Recorded state, or null.
 * @param {{projectionHash: string, sections: Record<string, string>}} input.current
 *   Hashes of the freshly collected dataset.
 * @param {Date} [input.now] - Current time.
 * @param {number} [input.maxAgeDays] - Forced-rebuild age.
 * @returns {RebuildDecision} The decision.
 */
export function decideRebuild({
  state,
  current,
  now = new Date(),
  maxAgeDays = DEFAULT_MAX_AGE_DAYS,
}) {
  if (!state || typeof state.projectionHash !== "string") {
    return {
      rebuild: true,
      reason: "no-state",
      changedSections: [],
      ageDays: null,
    };
  }
  const builtAtMs = Date.parse(state.builtAt);
  const ageDays = Number.isNaN(builtAtMs)
    ? null
    : (now.getTime() - builtAtMs) / DAY_MS;
  const previous = state.sections ?? {};
  const changedSections = Object.keys(current.sections)
    .filter((key) => previous[key] !== current.sections[key])
    .toSorted(compare);
  if (state.projectionHash !== current.projectionHash) {
    return { rebuild: true, reason: "changed", changedSections, ageDays };
  }
  if (ageDays === null || ageDays > maxAgeDays) {
    return { rebuild: true, reason: "stale", changedSections: [], ageDays };
  }
  return { rebuild: false, reason: "unchanged", changedSections: [], ageDays };
}

/**
 * Reads the state file. A missing or unreadable file is "no state".
 *
 * @param {string} statePath - Path to read.
 * @returns {RebuildState | null} The state, or null.
 */
export function readState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Writes the state file atomically (temp file + rename), creating its
 * directory if needed.
 *
 * @param {string} statePath - Destination.
 * @param {RebuildState} state - State to write.
 */
export function writeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmpPath, statePath);
}

/**
 * When the displayed part of `dataset` last changed. Its projection is the
 * one the live site was built from (same hash as `state`): that build's
 * moment carries over (`displayChangedAt`, or `builtAt` for a state written
 * before the field existed). Otherwise something the pages show is new, and
 * the moment is `now`. The pages' `dateModified` and sitemap `lastmod` fold
 * this in, so a data-only rebuild moves the date and nothing else does. Pure.
 *
 * @param {any} dataset - The freshly collected dataset.
 * @param {RebuildState | null} state - The recorded live state, if any.
 * @param {Date} [now] - Current time.
 * @returns {string} ISO timestamp.
 */
export function displayChangedAt(dataset, state, now = new Date()) {
  if (state?.projectionHash === hashProjection(dataset).projectionHash) {
    return state.displayChangedAt ?? state.builtAt ?? now.toISOString();
  }
  return now.toISOString();
}

/**
 * Records the dataset a build just used (the file on disk, not a fresh
 * collection) as the live projection. Called after a successful deploy.
 *
 * @param {object} [options] - Options.
 * @param {string} [options.root] - Repository root; defaults to `process.cwd()`.
 * @param {string} [options.datasetPath] - Dataset file; defaults to the
 *   build's output under `root`.
 * @param {string} [options.statePath] - State file; defaults to
 *   {@link resolveStatePath}.
 * @param {Date} [options.now] - Build time to record.
 * @returns {RebuildState} What was written.
 */
export function recordBuiltDataset({
  root = process.cwd(),
  datasetPath = path.join(root, DATASET_RELATIVE_PATH),
  statePath = resolveStatePath(),
  now = new Date(),
} = {}) {
  const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
  const builtAt = now.toISOString();
  const state = {
    ...hashProjection(dataset),
    builtAt,
    displayChangedAt:
      typeof dataset.displayChangedAt === "string"
        ? dataset.displayChangedAt
        : builtAt,
  };
  writeState(statePath, state);
  return state;
}
