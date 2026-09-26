/**
 * Guards how the GitLab.com part joins the build-time dataset: summed
 * totals, the GitLab rows of the "Contributed to" strip, the achievement
 * shape, and the fallback to the fixture's GitLab part only.
 *
 * @module
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  combineSummary,
  EMPTY_GITLAB_PART,
  gitlabContributedTo,
  loadGitlabPart,
  median,
  shapeGitlabAchievements,
} from "./merge-gitlab.mjs";

const DISPLAY = {
  "gitlab-org/gitlab": "GitLab",
  "gitlab-org/cells/http-router": "GitLab",
  "gitlab-org/api/client-go": "GitLab Go client",
};

/**
 * A GitLab ledger item.
 *
 * @param {string} fullName - Project path.
 * @param {string} state - Ledger state.
 * @param {string} [kind] - Ledger kind.
 * @returns {object} The item.
 */
function item(fullName, state, kind = "pull_request") {
  return {
    platform: "gitlab",
    kind,
    state,
    fullName,
    number: 1,
    createdAt: "2026-09-10T10:00:00.000Z",
    hoursToMerge: state === "merged" ? 24 : null,
    comments: 0,
    title: "t",
  };
}

const GITHUB_SUMMARY = {
  contributionTotals: {
    prMerged: 33,
    prOpen: 15,
    prClosed: 11,
    issuesOpen: 24,
    issuesClosed: 19,
    repos: 51,
    owners: 47,
    reposWithMerge: 18,
    lastPrDate: "2026-09-26T00:00:00",
  },
  codeVsListingSplit: {
    codeOrDocs: {
      merged: 19,
      open: 10,
      closed: 8,
      reposMerged: 12,
      medianHoursToMerge: 48,
    },
    listing: {
      merged: 14,
      open: 5,
      closed: 3,
      reposMerged: 6,
      medianHoursToMerge: 8.85,
    },
  },
  answersCount: 13,
  discussionTotals: { comments: 89, discussions: 65, repos: 43 },
};

test("median handles odd, even and empty lists", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test("combineSummary adds GitLab MRs to the code bucket and keeps listings GitHub-only", () => {
  const items = [
    item("gitlab-org/gitlab", "merged"),
    item("gitlab-org/api/client-go", "merged"),
    item("gitlab-org/api/client-go", "open"),
    item("gitlab-org/api/client-go", "closed"),
    item("gitlab-org/gitlab", "open", "issue"),
  ];
  const combined = combineSummary(GITHUB_SUMMARY, items, [10, 20, 30]);
  assert.deepEqual(combined.contributionTotals, {
    prMerged: 35,
    prOpen: 16,
    prClosed: 12,
    issuesOpen: 25,
    issuesClosed: 19,
    repos: 53,
    owners: 48,
    reposWithMerge: 20,
    lastPrDate: "2026-09-26T00:00:00",
  });
  assert.deepEqual(combined.codeVsListingSplit.codeOrDocs, {
    merged: 21,
    open: 11,
    closed: 9,
    reposMerged: 14,
    medianHoursToMerge: 20,
  });
  assert.deepEqual(
    combined.codeVsListingSplit.listing,
    GITHUB_SUMMARY.codeVsListingSplit.listing,
  );
  assert.deepEqual(combined.byPlatform, {
    github: { prs: 59, issues: 43 },
    gitlab: { prs: 4, issues: 1 },
  });
});

test("gitlabContributedTo folds GitLab + its router, keeps the Go client apart", () => {
  const rows = gitlabContributedTo(
    {
      items: [
        item("gitlab-org/gitlab", "merged"),
        item("gitlab-org/gitlab", "merged"),
        item("gitlab-org/cells/http-router", "merged"),
        item("gitlab-org/api/client-go", "merged"),
        item("gitlab-org/api/client-go", "open"),
      ],
      projects: [
        { fullName: "gitlab-org/gitlab", stars: 6146 },
        { fullName: "gitlab-org/cells/http-router", stars: 4 },
        { fullName: "gitlab-org/api/client-go", stars: 106 },
      ],
    },
    DISPLAY,
  );
  assert.deepEqual(
    rows.map((row) => [
      row.project,
      row.repo,
      row.merged,
      row.stars,
      row.platform,
    ]),
    [
      ["GitLab", "gitlab-org/gitlab", 3, 6146, "gitlab"],
      ["GitLab Go client", "gitlab-org/api/client-go", 1, 106, "gitlab"],
    ],
  );
  assert.equal(rows[0].lastMergedAt, "2026-09-11T10:00:00.000Z");
});

test("shapeGitlabAchievements marks the platform and has no progress", () => {
  const [row] = shapeGitlabAchievements([
    {
      achievement: "gitlab-level-3-contributor",
      name: "Level 3 Contributor",
      description: "d",
      namespace: "gitlab-org/achievements",
      awardedAt: "2026-09-14T20:11:50Z",
    },
  ]);
  assert.equal(row.platform, "gitlab");
  assert.equal(row.count, null);
  assert.equal(row.agrees, false);
  assert.equal(row.awardedAt, "2026-09-14T20:11:50Z");
});

test("loadGitlabPart falls back to the fixture's GitLab part only", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gl-merge-"));
  const fixturePath = path.join(dir, "fixture.json");
  const fixturePart = { ...EMPTY_GITLAB_PART, items: [item("a/b", "merged")] };
  fs.writeFileSync(
    fixturePath,
    JSON.stringify({ summary: "github part", gitlab: fixturePart }),
  );
  const warnings = [];
  const { part, fromFixture } = await loadGitlabPart({
    root: dir,
    fixturePath,
    contributions: /** @type {any} */ ({
      gitlab: { username: "jmrp", userId: 1, excludeNamespaces: [] },
    }),
    warn: (line) => {
      warnings.push(line);
    },
    makeClient: () => {
      throw new Error("GITLAB_COM_TOKEN_READ_ONLY is not set");
    },
  });
  assert.equal(fromFixture, true);
  assert.deepEqual(part, fixturePart);
  assert.ok(warnings.some((line) => line.includes("is not set")));
});

test("loadGitlabPart returns the empty part when no GitLab account is configured", async () => {
  const { part } = await loadGitlabPart({
    root: "/nonexistent",
    fixturePath: "/nonexistent/fixture.json",
    contributions: /** @type {any} */ ({ gitlab: null }),
    warn: () => {},
  });
  assert.deepEqual(part, EMPTY_GITLAB_PART);
});
