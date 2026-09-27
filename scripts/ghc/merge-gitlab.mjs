/**
 * Folds the GitLab.com part of the contributions (`scripts/gl/`) into the
 * build-time dataset `build-data.mjs` writes: combined summary totals, the
 * GitLab rows of the "Contributed to" strip, and the GitLab achievements.
 * Pure functions, plus {@link loadGitlabPart}, which owns the fallback to
 * the committed fixture's GitLab part when GitLab.com cannot be reached.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

import { createGitlabClient } from "../gl/client.mjs";
import { collectGitlab } from "../gl/collect.mjs";
import { foldProjectName, pickPrimaryRepo } from "./contributions-yaml.mjs";
import { ensureGitlabAchievementBadges } from "./fetch-achievement-badges.mjs";

/** An empty GitLab part: what a build with no GitLab data at all renders. */
export const EMPTY_GITLAB_PART = Object.freeze({
  fetchedAt: null,
  username: null,
  items: [],
  projects: [],
  achievements: [],
});

/**
 * Median of a list of numbers, or null for an empty list.
 *
 * @param {readonly number[]} values - Values.
 * @returns {number | null} The median.
 */
export function median(values) {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Counts GitLab items the way `getContributionTotals` counts GitHub ones.
 *
 * @param {readonly {kind: string, state: string, fullName: string, createdAt: string}[]} items - GitLab items.
 * @returns {{prMerged: number, prOpen: number, prClosed: number,
 *   issuesOpen: number, issuesClosed: number, repos: number, owners: number,
 *   reposWithMerge: number, lastPrDate: string | null}} The totals.
 */
export function gitlabTotals(items) {
  const totals = {
    prMerged: 0,
    prOpen: 0,
    prClosed: 0,
    issuesOpen: 0,
    issuesClosed: 0,
  };
  const repos = new Set();
  const owners = new Set();
  const reposWithMerge = new Set();
  let lastPrDate = null;
  for (const item of items) {
    repos.add(item.fullName);
    owners.add(item.fullName.split("/", 1)[0]);
    if (item.kind === "issue") {
      if (item.state === "open") totals.issuesOpen += 1;
      else totals.issuesClosed += 1;
      continue;
    }
    if (item.state === "merged") {
      totals.prMerged += 1;
      reposWithMerge.add(item.fullName);
    } else if (item.state === "open") totals.prOpen += 1;
    else totals.prClosed += 1;
    if (!lastPrDate || Date.parse(item.createdAt) > Date.parse(lastPrDate)) {
      lastPrDate = item.createdAt;
    }
  }
  return {
    ...totals,
    repos: repos.size,
    owners: owners.size,
    reposWithMerge: reposWithMerge.size,
    lastPrDate,
  };
}

/**
 * The later of two timestamps (either may be null or lack a zone suffix).
 *
 * @param {string | null} a - First.
 * @param {string | null} b - Second.
 * @returns {string | null} The later one.
 */
function later(a, b) {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/**
 * GitHub summary + GitLab items → the combined summary. GitLab has no
 * listing repositories, so every GitLab merge request is code or docs.
 *
 * @param {object} summary - The GitHub-only summary `collectDataset` built.
 * @param {readonly {kind: string, state: string, fullName: string, createdAt: string}[]} gitlabItems - GitLab items.
 * @param {readonly number[]} codeMergeHours - Hours to merge of every merged
 *   code/docs PR or MR on both platforms, for the combined median.
 * @returns {object} The combined summary, with a `byPlatform` breakdown.
 */
export function combineSummary(summary, gitlabItems, codeMergeHours) {
  const gl = gitlabTotals(gitlabItems);
  const gh = summary.contributionTotals;
  const code = summary.codeVsListingSplit.codeOrDocs;
  return {
    ...summary,
    contributionTotals: {
      prMerged: gh.prMerged + gl.prMerged,
      prOpen: gh.prOpen + gl.prOpen,
      prClosed: gh.prClosed + gl.prClosed,
      issuesOpen: gh.issuesOpen + gl.issuesOpen,
      issuesClosed: gh.issuesClosed + gl.issuesClosed,
      repos: gh.repos + gl.repos,
      owners: gh.owners + gl.owners,
      reposWithMerge: gh.reposWithMerge + gl.reposWithMerge,
      lastPrDate: later(gh.lastPrDate, gl.lastPrDate),
    },
    codeVsListingSplit: {
      ...summary.codeVsListingSplit,
      codeOrDocs: {
        merged: code.merged + gl.prMerged,
        open: code.open + gl.prOpen,
        closed: code.closed + gl.prClosed,
        reposMerged: code.reposMerged + gl.reposWithMerge,
        medianHoursToMerge: median(codeMergeHours) ?? code.medianHoursToMerge,
      },
    },
    byPlatform: {
      github: {
        prs: gh.prMerged + gh.prOpen + gh.prClosed,
        issues: gh.issuesOpen + gh.issuesClosed,
      },
      gitlab: {
        prs: gl.prMerged + gl.prOpen + gl.prClosed,
        issues: gl.issuesOpen + gl.issuesClosed,
      },
    },
  };
}

/**
 * The GitLab rows of the "Contributed to" strip: folded projects with at
 * least one merged merge request, the most-merged project standing for the
 * group's link and star count.
 *
 * @param {{items: readonly {kind: string, state: string, fullName: string,
 *   createdAt: string, hoursToMerge: number | null}[],
 *   projects: readonly {fullName: string, stars: number | null,
 *   language?: string | null}[]}} part - GitLab part.
 * @param {Record<string, string>} displayName - Folding map.
 * @param {Record<string, string>} [canonicalRepo] - Display name → the
 *   project path that stands for the group, overriding the merge count.
 * @returns {{project: string, repo: string, platform: 'gitlab', merged: number,
 *   lastMergedAt: string | null, stars: number | null,
 *   language: string | null}[]} Rows.
 */
export function gitlabContributedTo(part, displayName, canonicalRepo = {}) {
  const starsByRepo = new Map(part.projects.map((p) => [p.fullName, p.stars]));
  const languageByRepo = new Map(
    part.projects.map((p) => [p.fullName, p.language ?? null]),
  );
  /** @type {Map<string, {merged: number, lastMergedAt: string | null, perRepo: Map<string, number>}>} */
  const groups = new Map();
  for (const item of part.items) {
    if (item.kind !== "pull_request" || item.state !== "merged") continue;
    const project = foldProjectName(item.fullName, displayName);
    const group = groups.get(project) ?? {
      merged: 0,
      lastMergedAt: null,
      perRepo: new Map(),
    };
    group.merged += 1;
    group.perRepo.set(
      item.fullName,
      (group.perRepo.get(item.fullName) ?? 0) + 1,
    );
    const mergedAt = new Date(
      Date.parse(item.createdAt) + (item.hoursToMerge ?? 0) * 3_600_000,
    ).toISOString();
    group.lastMergedAt = later(group.lastMergedAt, mergedAt);
    groups.set(project, group);
  }
  return [...groups].map(([project, group]) => {
    const { repo } = pickPrimaryRepo(
      [...group.perRepo].map(([fullName, merged]) => ({
        repo: fullName,
        merged,
        stars: starsByRepo.get(fullName) ?? null,
      })),
      canonicalRepo[project],
    );
    return {
      project,
      repo,
      platform: /** @type {const} */ ("gitlab"),
      merged: group.merged,
      lastMergedAt: group.lastMergedAt,
      stars: starsByRepo.get(repo) ?? null,
      language: languageByRepo.get(repo) ?? null,
    };
  });
}

/**
 * GitLab achievement rows → the shelf's achievement shape. GitLab's
 * achievements have no tiers or progress, so those fields are neutral and
 * the shelf shows the award date instead.
 *
 * @param {readonly {achievement: string, name: string, description: string | null,
 *   namespace: string | null, awardedAt: string | null}[]} rows - GitLab rows.
 * @returns {object[]} Shelf rows with `platform: "gitlab"`.
 */
export function shapeGitlabAchievements(rows) {
  return rows.map((row) => ({
    platform: "gitlab",
    achievement: row.achievement,
    name: row.name,
    tierNumber: 1,
    tierName: "default",
    count: null,
    nextThreshold: 0,
    percent: 0,
    agrees: false,
    description: row.description,
    awardedAt: row.awardedAt,
  }));
}

/**
 * The GitLab part of the committed fixture, or the empty part.
 *
 * @param {string} fixturePath - Absolute fixture path.
 * @returns {typeof EMPTY_GITLAB_PART} The part.
 */
export function readFixtureGitlabPart(fixturePath) {
  try {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    return fixture.gitlab && Array.isArray(fixture.gitlab.items)
      ? fixture.gitlab
      : EMPTY_GITLAB_PART;
  } catch {
    return EMPTY_GITLAB_PART;
  }
}

/**
 * Collects the GitLab part live (and self-hosts its badges), falling back
 * to the committed fixture's GitLab part, and only that part, when GitLab.com
 * is unreachable or no token is configured. Never throws.
 *
 * @param {object} options - Options.
 * @param {string} options.root - Repository root.
 * @param {string} options.fixturePath - Absolute fixture path.
 * @param {import('./contributions-yaml.mjs').ContributionsConfig} options.contributions - Curation config.
 * @param {(line: string) => void} options.warn - Warning sink.
 * @param {typeof collectGitlab} [options.collect] - Injectable collector.
 * @param {() => import('../gl/client.mjs').GitlabClient} [options.makeClient] - Injectable client factory.
 * @returns {Promise<{part: object, fromFixture: boolean}>} The part.
 */
export async function loadGitlabPart({
  root,
  fixturePath,
  contributions,
  warn,
  collect = collectGitlab,
  makeClient = () => createGitlabClient(),
}) {
  if (!contributions.gitlab) {
    return { part: EMPTY_GITLAB_PART, fromFixture: false };
  }
  try {
    const { rawAchievements, ...part } = await collect(
      makeClient(),
      contributions.gitlab,
    );
    await ensureGitlabAchievementBadges(rawAchievements, { root, warn });
    return { part, fromFixture: false };
  } catch (error) {
    const message = (
      error instanceof Error ? error.message : String(error)
    ).replaceAll(/[\r\n\t]+/g, " ");
    warn(
      `Could not collect the GitLab.com contributions (${message}); using the GitLab part of ${path.relative(root, fixturePath)}.`,
    );
    return { part: readFixtureGitlabPart(fixturePath), fromFixture: true };
  }
}
