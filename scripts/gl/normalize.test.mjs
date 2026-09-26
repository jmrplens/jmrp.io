/**
 * Guards the GitLab → ledger mapping (same shape as the GitHub side), the
 * own-namespace exclusion, and the live-summary fold.
 *
 * @module
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isOwnNamespace,
  normalizeAchievement,
  normalizeItem,
  projectPathFromWebUrl,
  summarizeGitlab,
} from "./normalize.mjs";

const MERGED_MR = {
  iid: 255_300,
  project_id: 278_964,
  state: "merged",
  created_at: "2026-09-14T09:54:58.576Z",
  merged_at: "2026-09-23T13:22:57.779Z",
  web_url: "https://gitlab.com/gitlab-org/gitlab/-/merge_requests/255300",
  title: "Ignore revoked UIDs when listing the identities of a GPG key",
  user_notes_count: 34,
};

test("projectPathFromWebUrl keeps nested paths and rejects other hosts", () => {
  assert.equal(
    projectPathFromWebUrl(
      "https://gitlab.com/gitlab-org/api/client-go/-/merge_requests/3053",
    ),
    "gitlab-org/api/client-go",
  );
  assert.equal(
    projectPathFromWebUrl("https://example.com/gitlab-org/gitlab/-/issues/1"),
    null,
  );
  assert.equal(projectPathFromWebUrl("not a url"), null);
});

test("normalizeItem maps a merged MR onto the ledger shape", () => {
  const item = normalizeItem(MERGED_MR, "pull_request");
  assert.deepEqual(item, {
    platform: "gitlab",
    kind: "pull_request",
    state: "merged",
    fullName: "gitlab-org/gitlab",
    number: 255_300,
    projectId: 278_964,
    createdAt: "2026-09-14T09:54:58.576Z",
    hoursToMerge:
      (Date.parse(MERGED_MR.merged_at) - Date.parse(MERGED_MR.created_at)) /
      3_600_000,
    comments: 34,
    title: MERGED_MR.title,
  });
});

test("normalizeItem maps opened to open, locked to closed, and drops confidential issues", () => {
  assert.equal(
    normalizeItem(
      { ...MERGED_MR, state: "opened", merged_at: null },
      "pull_request",
    )?.state,
    "open",
  );
  const locked = normalizeItem(
    { ...MERGED_MR, state: "locked", merged_at: null },
    "pull_request",
  );
  assert.equal(locked?.state, "closed");
  assert.equal(locked?.hoursToMerge, null);
  assert.equal(
    normalizeItem({ ...MERGED_MR, confidential: true }, "issue"),
    null,
  );
});

test("isOwnNamespace matches the top-level namespace only", () => {
  assert.equal(isOwnNamespace("plens1/kg-fixtures", ["jmrp", "plens1"]), true);
  assert.equal(isOwnNamespace("JMRP/mirror", ["jmrp"]), true);
  assert.equal(isOwnNamespace("gitlab-org/jmrp", ["jmrp"]), false);
});

test("normalizeAchievement derives a stable gitlab- slug", () => {
  const row = normalizeAchievement({
    createdAt: "2026-09-14T20:11:50Z",
    achievement: {
      name: "Level 3 Contributor",
      description: "Wider community member.",
      avatarUrl:
        "https://gitlab.com/uploads/-/system/achievements/achievement/avatar/61/contributor-level-3.png?v=1",
      namespace: { fullPath: "gitlab-org/achievements" },
    },
  });
  assert.equal(row?.achievement, "gitlab-level-3-contributor");
  assert.equal(row?.namespace, "gitlab-org/achievements");
  assert.equal(normalizeAchievement({ achievement: { name: " " } }), null);
});

test("summarizeGitlab counts merge requests only and folds merged projects", () => {
  const displayName = {
    "gitlab-org/gitlab": "GitLab",
    "gitlab-org/cells/http-router": "GitLab",
  };
  const summary = summarizeGitlab(
    [
      { kind: "pull_request", state: "merged", fullName: "gitlab-org/gitlab" },
      {
        kind: "pull_request",
        state: "merged",
        fullName: "gitlab-org/cells/http-router",
      },
      {
        kind: "pull_request",
        state: "open",
        fullName: "gitlab-org/api/client-go",
      },
      { kind: "pull_request", state: "closed", fullName: "gitlab-org/gitlab" },
      { kind: "issue", state: "open", fullName: "gitlab-org/gitlab" },
    ],
    displayName,
  );
  assert.deepEqual(summary, {
    merged: 2,
    open: 1,
    closed: 1,
    projects: ["GitLab"],
  });
});
