/**
 * Tests for the pure release pick behind `getLatestRelease`: `age_days` is a
 * whole number of days, so two releases shipped the same day tie on it and
 * the version tag must decide (production audit 2026-09-27, N2).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareVersionTags,
  influxTimeToIso,
  pickLatestReleases,
} from "./queries.mjs";

describe("pickLatestReleases", () => {
  it("takes the latest publication, not the highest tag", () => {
    // ghchronicle v2.5.0 and v2.5.1 shipped the same day, 2 h apart; the
    // floored age_days tied them and the old pick could show v2.5.0.
    const rows = [
      {
        repo: "ghchronicle",
        tag: "v2.5.0",
        publishedAt: "2026-09-25T09:39:01.000Z",
      },
      {
        repo: "ghchronicle",
        tag: "v2.5.1",
        publishedAt: "2026-09-25T11:58:52.000Z",
      },
      {
        repo: "ghchronicle",
        tag: "v2.4.0",
        publishedAt: "2026-09-21T17:36:36.000Z",
      },
    ];
    for (const order of [rows, rows.toReversed()]) {
      assert.equal(pickLatestReleases(order)[0].tag, "v2.5.1");
    }
    const older = [
      { repo: "a", tag: "v9.0.0", publishedAt: "2026-01-01T00:00:00.000Z" },
      { repo: "a", tag: "v1.2.0", publishedAt: "2026-02-01T00:00:00.000Z" },
    ];
    assert.equal(pickLatestReleases(older)[0].tag, "v1.2.0");
  });

  it("breaks an exact-instant tie by the highest version", () => {
    const at = "2026-09-14T23:52:11.000Z";
    const rows = [
      { repo: "a", tag: "v1", publishedAt: at },
      { repo: "a", tag: "v1.0.0", publishedAt: at },
    ];
    assert.equal(pickLatestReleases(rows)[0].tag, "v1.0.0");
    assert.equal(pickLatestReleases(rows.toReversed())[0].tag, "v1.0.0");
  });

  it("returns one row per repo, ordered by repo", () => {
    const rows = [
      { repo: "b", tag: "v1.0.0", publishedAt: "2026-09-01T00:00:00.000Z" },
      { repo: "a", tag: "v2.0.0", publishedAt: "2026-08-01T00:00:00.000Z" },
    ];
    assert.deepEqual(
      pickLatestReleases(rows).map((row) => row.repo),
      ["a", "b"],
    );
  });
});

describe("influxTimeToIso", () => {
  it("reads a zone-less timestamp as UTC, at any precision", () => {
    assert.equal(
      influxTimeToIso("2026-09-25T11:58:52"),
      "2026-09-25T11:58:52.000Z",
    );
    assert.equal(
      influxTimeToIso("2026-09-27T12:59:41.188292945"),
      "2026-09-27T12:59:41.188Z",
    );
    assert.equal(
      influxTimeToIso("2026-09-25T11:58:52Z"),
      "2026-09-25T11:58:52.000Z",
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
