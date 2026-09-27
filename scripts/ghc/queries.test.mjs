/**
 * Tests for the pure release pick behind `getLatestRelease`: `age_days` is a
 * whole number of days, so two releases shipped the same day tie on it and
 * the version tag must decide (production audit 2026-09-27, N2).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compareVersionTags, pickLatestReleases } from "./queries.mjs";

describe("pickLatestReleases", () => {
  it("breaks a same-day tie by the highest version, in either row order", () => {
    const rows = [
      { repo: "ghchronicle", tag: "v2.5.0", ageDays: 1 },
      { repo: "ghchronicle", tag: "v2.5.1", ageDays: 1 },
      { repo: "ghchronicle", tag: "v2.4.0", ageDays: 3 },
    ];
    const expected = [{ repo: "ghchronicle", tag: "v2.5.1", ageDays: 1 }];
    assert.deepEqual(pickLatestReleases(rows), expected);
    assert.deepEqual(pickLatestReleases(rows.toReversed()), expected);
  });

  it("prefers the youngest release over a higher tag published earlier", () => {
    const rows = [
      { repo: "a", tag: "v9.0.0", ageDays: 10 },
      { repo: "a", tag: "v1.2.0", ageDays: 2 },
    ];
    assert.deepEqual(pickLatestReleases(rows), [
      { repo: "a", tag: "v1.2.0", ageDays: 2 },
    ]);
  });

  it("returns one row per repo, ordered by repo", () => {
    const rows = [
      { repo: "b", tag: "v1.0.0", ageDays: 5 },
      { repo: "a", tag: "v2.0.0", ageDays: 7 },
    ];
    assert.deepEqual(
      pickLatestReleases(rows).map((row) => row.repo),
      ["a", "b"],
    );
  });
});

describe("compareVersionTags", () => {
  it("compares segments numerically", () => {
    assert.ok(compareVersionTags("v2.5.10", "v2.5.9") > 0);
    assert.ok(compareVersionTags("v2.5.1", "v2.5.0") > 0);
    assert.ok(compareVersionTags("v2.9.9", "v3.0.0") < 0);
  });

  it("ranks a full version above the floating major tag of the same day", () => {
    assert.ok(compareVersionTags("v1.0.0", "v1") > 0);
  });
});
