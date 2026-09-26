/**
 * Guards the repo allowlist and its SQL/token helpers — the privacy
 * boundary every ghchronicle query relies on (never a deny-list, never an
 * open `GROUP BY owner`).
 *
 * @module
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACTIVE_REPOS,
  ALL_ROSTER_REPOS,
  ARCHIVED_REPOS,
  MAINTENANCE_REPOS,
  projectTokenId,
  sqlFullNameList,
  sqlRepoList,
} from "./roster.mjs";

test("ACTIVE_REPOS and ARCHIVED_REPOS never overlap and sum to ALL_ROSTER_REPOS", () => {
  const active = new Set(ACTIVE_REPOS);
  const archived = new Set(ARCHIVED_REPOS);
  for (const repo of active) assert.equal(archived.has(repo), false, repo);
  assert.equal(
    ALL_ROSTER_REPOS.length,
    ACTIVE_REPOS.length + ARCHIVED_REPOS.length,
  );
});

test("MAINTENANCE_REPOS is ACTIVE_REPOS minus the LaTeX thesis template", () => {
  assert.equal(MAINTENANCE_REPOS.includes("TFG-TFM_EPS"), false);
  assert.equal(MAINTENANCE_REPOS.length, ACTIVE_REPOS.length - 1);
  for (const repo of MAINTENANCE_REPOS)
    assert.equal(ACTIVE_REPOS.includes(repo), true);
});

test("sqlRepoList quotes every repo name", () => {
  assert.equal(
    sqlRepoList(["gitlab-mcp-server", "phonometry"]),
    "'gitlab-mcp-server','phonometry'",
  );
});

test("sqlRepoList rejects a repo name it cannot safely quote", () => {
  assert.throws(() => sqlRepoList(["it's-a-trap"]), /unsafe repo name/);
  assert.throws(() => sqlRepoList(["a/b"]), /unsafe repo name/);
});

test("sqlRepoList rejects an empty list rather than emitting `IN ()`", () => {
  assert.throws(() => sqlRepoList([]), /empty list/);
});

test("sqlFullNameList quotes owner/repo pairs and rejects a bare repo name", () => {
  assert.equal(
    sqlFullNameList(["jmrplens/gitlab-mcp-server", "TriliumNext/Trilium"]),
    "'jmrplens/gitlab-mcp-server','TriliumNext/Trilium'",
  );
  assert.throws(
    () => sqlFullNameList(["gitlab-mcp-server"]),
    /unsafe full_name/,
  );
});

test("every roster repo produces a token id matching the PRJ_ alphabet", () => {
  for (const repo of ACTIVE_REPOS) {
    assert.match(projectTokenId(repo), /^[A-Z0-9_]+$/, repo);
  }
});

test("projectTokenId derives the documented examples", () => {
  assert.equal(
    projectTokenId("Cloudflare-DNS-Updater"),
    "CLOUDFLARE_DNS_UPDATER",
  );
  assert.equal(projectTokenId("TFG-TFM_EPS"), "TFG_TFM_EPS");
  assert.equal(projectTokenId("gitlab-mcp-server"), "GITLAB_MCP_SERVER");
});

test("projectTokenId never collides across the active roster", () => {
  const ids = ACTIVE_REPOS.map(projectTokenId);
  assert.equal(new Set(ids).size, ids.length);
});
