/**
 * Guards the GitLab collection's privacy boundary: only public projects,
 * never the owner's own namespaces, and achievement image URLs kept apart
 * from what the dataset stores.
 *
 * @module
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { collectGitlab, getProjectDetails } from "./collect.mjs";

const SETTINGS = {
  username: "jmrp",
  userId: 15_767_218,
  excludeNamespaces: ["jmrp", "plens1"],
};

/**
 * A row as the REST API returns it.
 *
 * @param {number} iid - Item iid.
 * @param {number} projectId - Project id.
 * @param {string} path - Project path.
 * @param {string} state - GitLab state.
 * @param {string} kind - `merge_requests` or `issues`.
 * @returns {Record<string, unknown>} The row.
 */
function row(iid, projectId, path, state, kind = "merge_requests") {
  return {
    iid,
    project_id: projectId,
    state,
    created_at: `2026-09-${String(10 + (iid % 10)).padStart(2, "0")}T10:00:00Z`,
    merged_at: state === "merged" ? "2026-09-25T10:00:00Z" : null,
    web_url: `https://gitlab.com/${path}/-/${kind}/${iid}`,
    title: `Item ${iid}`,
    user_notes_count: 1,
  };
}

/** A fake client over canned data. */
function fakeClient() {
  const projects = {
    1: {
      id: 1,
      visibility: "public",
      path_with_namespace: "gitlab-org/gitlab",
      name: "GitLab",
      star_count: 6146,
      web_url: "https://gitlab.com/gitlab-org/gitlab",
    },
    2: {
      id: 2,
      visibility: "private",
      path_with_namespace: "acme/secret",
      name: "secret",
      star_count: 0,
      web_url: "https://gitlab.com/acme/secret",
    },
    3: {
      id: 3,
      visibility: "public",
      path_with_namespace: "plens1/kg-fixtures",
      name: "kg",
      star_count: 0,
      web_url: "https://gitlab.com/plens1/kg-fixtures",
    },
  };
  const requested = [];
  return {
    requested,
    async get(path) {
      requested.push(path);
      return projects[Number(path.split("/").at(-1))];
    },
    async getAll(path) {
      if (path === "/merge_requests") {
        return [
          row(1, 1, "gitlab-org/gitlab", "merged"),
          row(2, 2, "acme/secret", "merged"),
          row(3, 3, "plens1/kg-fixtures", "closed"),
          row(4, 1, "gitlab-org/gitlab", "opened"),
        ];
      }
      return [row(5, 1, "gitlab-org/gitlab", "opened", "issues")];
    },
    async graphql(query) {
      requested.push(query);
      if (query.startsWith("{project(")) {
        return {
          project: {
            languages: [
              { name: "JavaScript", share: 20 },
              { name: "Ruby", share: 68 },
            ],
            mergeRequests: {
              nodes: [
                {
                  iid: "1",
                  diffStatsSummary: {
                    additions: 797,
                    deletions: 3,
                    fileCount: 11,
                  },
                },
                // A closed MR whose branch is gone reports no files.
                {
                  iid: "4",
                  diffStatsSummary: {
                    additions: 0,
                    deletions: 0,
                    fileCount: 0,
                  },
                },
              ],
            },
          },
        };
      }
      return {
        user: {
          userAchievements: {
            nodes: [
              {
                createdAt: "2026-09-14T20:11:50Z",
                achievement: {
                  name: "Level 3 Contributor",
                  description: "d",
                  avatarUrl:
                    "https://gitlab.com/uploads/-/system/achievements/achievement/avatar/61/contributor-level-3.png?v=1",
                  namespace: { fullPath: "gitlab-org/achievements" },
                },
              },
            ],
          },
        },
      };
    },
  };
}

test("collectGitlab keeps public, non-own items and drops private projects", async () => {
  const client = fakeClient();
  const part = await collectGitlab(client, SETTINGS);
  assert.deepEqual(
    part.items.map((item) => `${item.fullName}:${item.kind}:${item.number}`),
    [
      "gitlab-org/gitlab:issue:5",
      "gitlab-org/gitlab:pull_request:4",
      "gitlab-org/gitlab:pull_request:1",
    ],
  );
  assert.ok(part.items.every((item) => !("projectId" in item)));
  assert.deepEqual(
    part.projects.map((p) => [p.fullName, p.stars]),
    [["gitlab-org/gitlab", 6146]],
  );
  // The own namespace is never even asked about.
  assert.ok(!client.requested.includes("/projects/3"));
});

test("collectGitlab keeps the image URL out of the stored achievements", async () => {
  const part = await collectGitlab(fakeClient(), SETTINGS);
  assert.equal(part.achievements.length, 1);
  assert.ok(!("image" in part.achievements[0]));
  assert.match(part.rawAchievements[0].image ?? "", /contributor-level-3\.png/);
});

test("collectGitlab skips issues and achievements when asked", async () => {
  const part = await collectGitlab(fakeClient(), SETTINGS, {
    withIssues: false,
    withAchievements: false,
  });
  assert.ok(part.items.every((item) => item.kind === "pull_request"));
  assert.deepEqual(part.achievements, []);
});

test("collectGitlab adds each MR's diff size and the project's language", async () => {
  const client = fakeClient();
  const part = await collectGitlab(client, SETTINGS);
  const byNumber = Object.fromEntries(
    part.items.map((item) => [`${item.kind}:${item.number}`, item]),
  );
  assert.deepEqual(
    [
      byNumber["pull_request:1"].additions,
      byNumber["pull_request:1"].deletions,
      byNumber["pull_request:1"].changedFiles,
    ],
    [797, 3, 11],
  );
  // No files reported reads as unknown, and an issue has no size at all.
  assert.equal(byNumber["pull_request:4"].changedFiles, null);
  assert.equal(byNumber["issue:5"].additions, null);
  assert.equal(part.projects[0].language, "Ruby");
  // One query for the project, naming only its merge requests.
  const projectQueries = client.requested.filter((q) =>
    String(q).startsWith("{project("),
  );
  assert.equal(projectQueries.length, 1);
  assert.match(projectQueries[0], /iids:\["1","4"\]|iids:\["4","1"\]/);
});

test("collectGitlab skips the per-project details when asked", async () => {
  const client = fakeClient();
  const part = await collectGitlab(client, SETTINGS, { withDetails: false });
  assert.ok(client.requested.every((q) => !String(q).startsWith("{project(")));
  assert.equal(part.items[0].additions, null);
  assert.ok(!("language" in part.projects[0]));
});

test("getProjectDetails refuses a path it cannot quote safely", async () => {
  await assert.rejects(
    getProjectDetails(fakeClient(), 'a/b"){x}', [1]),
    /unsafe GitLab path/,
  );
});
