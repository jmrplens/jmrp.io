/**
 * Guards the rule the /projects strip and the homepage's upstream line print:
 * a merge in the last 12 months, most merged first, at most two per owner.
 *
 * @module
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { selectUpstreamStrip, stripOwner } from "./upstream-strip.mjs";

const AS_OF = "2026-10-30T10:09:07.519620652";

/**
 * A `contributedTo` row with defaults.
 *
 * @param {string} repo - `owner/repo`.
 * @param {number} merged - Merged changes.
 * @param {object} [extra] - Overrides.
 * @returns {{project: string, repo: string, merged: number, stars: number | null, lastMergedAt: string | null}} The row.
 */
const row = (repo, merged, extra = {}) => ({
  project: repo.split("/").at(-1),
  repo,
  merged,
  stars: 100,
  lastMergedAt: "2026-10-01T00:00:00",
  ...extra,
});

const names = (rows) => rows.map((r) => r.project);

test("orders by merged changes, then stars, then name", () => {
  const rows = [
    row("a/low", 1, { stars: 50_000 }),
    row("b/high", 9, { stars: 10 }),
    row("c/tie-more-stars", 3, { stars: 900 }),
    row("d/tie-fewer-stars", 3, { stars: 20 }),
    row("e/zeta", 2, { stars: 5 }),
    row("f/alpha", 2, { stars: 5 }),
  ];
  assert.deepEqual(names(selectUpstreamStrip(rows, AS_OF)), [
    "high",
    "tie-more-stars",
    "tie-fewer-stars",
    "alpha",
    "zeta",
    "low",
  ]);
});

test("unknown stars sort after any count", () => {
  const rows = [
    row("a/unknown", 2, { stars: null }),
    row("b/known", 2, { stars: 0 }),
  ];
  assert.deepEqual(names(selectUpstreamStrip(rows, AS_OF)), [
    "known",
    "unknown",
  ]);
});

test("keeps the 12-month window, inclusive at its edge", () => {
  const rows = [
    row("a/inside", 1, { lastMergedAt: "2025-10-30T10:09:07" }),
    row("b/outside", 9, { lastMergedAt: "2025-10-30T10:09:06" }),
    row("c/never", 5, { lastMergedAt: null }),
    row("d/after-as-of", 5, { lastMergedAt: "2026-10-31T00:00:00" }),
  ];
  // 2026 has no 29 February: exactly 365 days separate the edge from asOf.
  assert.deepEqual(names(selectUpstreamStrip(rows, "2026-10-30T10:09:07")), [
    "inside",
  ]);
});

test("reads a naive timestamp as UTC, whatever the machine's zone", () => {
  const rows = [row("a/edge", 1, { lastMergedAt: "2025-10-30T10:09:07" })];
  assert.equal(selectUpstreamStrip(rows, "2026-10-30T10:09:07Z").length, 1);
  assert.equal(selectUpstreamStrip(rows, "2026-10-30T10:09:08Z").length, 0);
});

test("caps each owner, nested GitLab paths included", () => {
  const rows = [
    row("gitlab-org/gitlab", 87),
    row("gitlab-org/api/client-go", 26),
    row("gitlab-org/cli", 10),
    row("getarcaneapp/arcane", 12),
  ];
  assert.deepEqual(names(selectUpstreamStrip(rows, AS_OF)), [
    "gitlab",
    "client-go",
    "arcane",
  ]);
});

test("components/ and gitlab-com/ share gitlab-org's cap", () => {
  assert.equal(stripOwner("components/toolkit"), "gitlab-org");
  assert.equal(
    stripOwner("gitlab-com/gl-infra/platform/runway/scrood"),
    "gitlab-org",
  );
  const rows = [
    row("gitlab-org/gitlab", 87),
    row("gitlab-org/api/client-go", 26),
    row("components/toolkit", 3),
    row("henrygd/beszel", 2),
  ];
  assert.deepEqual(names(selectUpstreamStrip(rows, AS_OF)), [
    "gitlab",
    "client-go",
    "beszel",
  ]);
});

test("the homepage call takes three, one per owner", () => {
  const rows = [
    row("gitlab-org/gitlab", 87),
    row("gitlab-org/api/client-go", 26),
    row("getarcaneapp/arcane", 12),
    row("modelcontextprotocol/go-sdk", 7),
    row("modelcontextprotocol/rust-sdk", 1),
  ];
  assert.deepEqual(
    names(selectUpstreamStrip(rows, AS_OF, { size: 3, perOwner: 1 })),
    ["gitlab", "arcane", "go-sdk"],
  );
});

test("never fills up: fewer eligible rows give a shorter list", () => {
  const rows = [
    row("a/one", 1),
    row("b/old", 4, { lastMergedAt: "2023-07-12T01:53:53" }),
  ];
  assert.deepEqual(names(selectUpstreamStrip(rows, AS_OF)), ["one"]);
});

test("no asOf, or an unreadable one, selects nothing", () => {
  assert.deepEqual(selectUpstreamStrip([row("a/one", 1)], null), []);
  assert.deepEqual(selectUpstreamStrip([row("a/one", 1)], "not a date"), []);
});

test("leaves the input array and its order untouched", () => {
  const rows = [row("a/low", 1), row("b/high", 9)];
  const before = rows.map((r) => r.project);
  selectUpstreamStrip(rows, AS_OF);
  assert.deepEqual(
    rows.map((r) => r.project),
    before,
  );
});
